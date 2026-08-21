import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type {
	AgentMode,
	ConversationItem,
	PermissionRequest,
	StreamEvent,
} from '../types/agent.js'
import type { ServerConfig } from '../config.js'
import { SessionStore } from '../store.js'

type PermissionResolver = (approved: boolean) => void

const MODE_PREFIX: Record<AgentMode, string> = {
	agent: '',
	ask: '[ASK MODE] Answer questions and analyze code only. Do NOT edit files, run commands, or make changes.\n\n',
	plan: '[PLAN MODE] Create a detailed plan for the task. Do NOT execute changes — only outline steps.\n\n',
}

export class PermissionQueue extends EventEmitter {
	private pending = new Map<string, PermissionRequest & { resolve: PermissionResolver }>()

	waitForApproval(
		projectId: string,
		toolName: string,
		description: string,
		parameters: Record<string, unknown>,
	): Promise<boolean> {
		return new Promise((resolve) => {
			const permission: PermissionRequest = {
				id: randomUUID(),
				projectId,
				toolName,
				description,
				parameters,
				createdAt: new Date().toISOString(),
				status: 'pending',
			}

			this.pending.set(permission.id, {
				...permission,
				resolve: (approved) => resolve(approved),
			})
			this.emit('permission', permission)
		})
	}

	respond(id: string, approved: boolean): PermissionRequest | null {
		const entry = this.pending.get(id)
		if (!entry) return null
		entry.resolve(approved)
		entry.status = approved ? 'approved' : 'denied'
		this.pending.delete(id)
		return entry
	}

	getPending(projectId?: string): PermissionRequest[] {
		return [...this.pending.values()]
			.filter((p) => !projectId || p.projectId === projectId)
			.map(({ resolve: _resolve, ...p }) => p)
	}
}

export class AgyService {
	constructor(
		private config: ServerConfig,
		private sessions: SessionStore,
		private permissions: PermissionQueue,
	) {}

	async runPrompt(
		projectPath: string,
		projectId: string,
		content: string,
		mode: AgentMode,
		onEvent: (event: StreamEvent) => void,
	): Promise<void> {
		const session = await this.sessions.getOrCreate(projectId)
		const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

		const userItem: ConversationItem = {
			id: randomUUID(),
			kind: 'message',
			role: 'user',
			content,
			timestamp: now,
			mode,
		}
		session.items.push(userItem)
		session.mode = mode
		await this.sessions.save(session)

		const prompt = `${MODE_PREFIX[mode]}${content}`
		const args = ['-p', prompt, '--output-format', 'stream-json']
		if (session.conversationId) {
			args.push('--conversation', session.conversationId)
		}

		onEvent({ type: 'activity', status: 'running', label: 'Thinking...' })

		let agentContent = ''
		let conversationId = session.conversationId ?? ''
		const agentItemId = randomUUID()

		await new Promise<void>((resolve) => {
			const child = spawn(this.config.agyPath, args, {
				cwd: projectPath,
				env: { ...process.env, FORCE_COLOR: '0' },
				stdio: ['ignore', 'pipe', 'pipe'],
			})

			let buffer = ''

			const processLine = async (line: string) => {
				if (!line.trim()) return
				try {
					const event = JSON.parse(line) as Record<string, unknown>

					if (event.event === 'init' && typeof event.conversation_id === 'string') {
						conversationId = event.conversation_id
					}

					if (event.event === 'step_update') {
						const update = event.step_update as Record<string, unknown>
						const stepType = update.step_type as string

						if (stepType === 'tool') {
							const toolName = update.tool_name as string
							const label = formatToolLabel(toolName, update.tool_info as Record<string, unknown> | undefined)

							if (mode === 'ask' && isWriteTool(toolName)) {
								onEvent({ type: 'activity', status: 'error', label: `Blocked: ${label} (ask mode)`, toolName })
								return
							}

							if (mode !== 'ask' && isWriteTool(toolName) && !this.config.autoApproveTools) {
								const approved = await this.permissions.waitForApproval(
									projectId,
									toolName,
									label,
									(update.tool_info as Record<string, unknown>) ?? {},
								)
								if (!approved) {
									onEvent({ type: 'activity', status: 'error', label: `Denied: ${label}`, toolName })
									return
								}
							}

							onEvent({ type: 'activity', status: 'running', label, toolName })
							onEvent({ type: 'activity', status: 'complete', label, toolName })
						}

						if (stepType === 'agent_response' && typeof update.text_delta === 'string') {
							agentContent += update.text_delta
							onEvent({ type: 'message_delta', content: update.text_delta })
						}
					}

					if (event.event === 'result') {
						const result = event.result as Record<string, unknown>
						conversationId = (result.conversation_id as string) ?? conversationId
						const status = result.status as string
						if (status === 'ERROR') {
							onEvent({ type: 'error', message: (result.error as string) ?? 'Agent error' })
						}
					}
				} catch {
					// non-json stderr line
				}
			}

			child.stdout.on('data', (data: Buffer) => {
				buffer += data.toString()
				const lines = buffer.split('\n')
				buffer = lines.pop() ?? ''
				for (const line of lines) {
					void processLine(line)
				}
			})

			child.stderr.on('data', (data: Buffer) => {
				const text = data.toString().trim()
				if (text.includes('authentication')) {
					onEvent({ type: 'error', message: 'Antigravity authentication required. Run `agy` on your laptop and sign in.' })
				}
			})

			child.on('close', async () => {
				if (buffer.trim()) await processLine(buffer)

				if (agentContent.trim()) {
					const agentItem: ConversationItem = {
						id: agentItemId,
						kind: 'message',
						role: 'agent',
						content: agentContent.trim(),
						timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
						mode,
					}
					session.items.push(agentItem)
				}

				session.conversationId = conversationId || session.conversationId
				session.updatedAt = new Date().toISOString()
				await this.sessions.save(session)

				onEvent({ type: 'done', conversationId: session.conversationId ?? '', status: 'SUCCESS' })
				resolve()
			})

			child.on('error', (err) => {
				onEvent({ type: 'error', message: err.message })
				resolve()
			})
		})
	}
}

function isWriteTool(toolName: string): boolean {
	return ['write_to_file', 'run_command', 'edit_file', 'apply_patch'].some((t) => toolName.includes(t))
}

function formatToolLabel(toolName: string, info?: Record<string, unknown>): string {
	if (toolName.includes('run_command')) {
		const params = info?.parameters as Record<string, unknown> | undefined
		const cmd = params?.CommandLine ?? params?.command
		return cmd ? `Running: ${cmd}` : 'Running command...'
	}
	if (toolName.includes('write') || toolName.includes('edit')) {
		const params = info?.parameters as Record<string, unknown> | undefined
		const file = params?.path ?? params?.file_path ?? params?.FilePath
		return file ? `Editing ${file}...` : 'Editing file...'
	}
	if (toolName.includes('read')) return 'Reading files...'
	return `${toolName}...`
}
