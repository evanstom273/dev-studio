import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type {
	AgentMode,
	ConversationItem,
	PermissionRequest,
	StreamEvent,
} from '../types/agent.js'
import type { ServerConfig } from '../config.js'
import { SessionStore } from '../store.js'
import { AgyPermissionService } from './agyPermissionService.js'

type PermissionResolver = (approved: boolean) => void

const MODE_PREFIX: Record<AgentMode, string> = {
	agent: '',
	ask: '[ASK MODE] Answer questions and analyze code only. Do NOT edit files, run commands, or make changes.\n\n',
	plan: '[PLAN MODE] Create a detailed plan for the task. Do NOT execute changes — only outline steps.\n\n',
}

const PERMISSION_DENIED_RE =
	/permission check failed for command "([^"]+)"/i
const PERMISSION_REQUEST_RE = /Requesting permission for:\s*(.+)/i

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

type StreamSession = {
	child: ChildProcessWithoutNullStreams
	projectPath: string
	projectId: string
	conversationId: string
	stdoutBuffer: string
}

export class AgyService {
	private streamSessions = new Map<string, StreamSession>()
	private agyPermissions = new AgyPermissionService()

	constructor(
		private config: ServerConfig,
		private sessions: SessionStore,
		private permissions: PermissionQueue,
	) {}

	async init(): Promise<void> {
		await this.agyPermissions.init()
	}

	async runPrompt(
		projectPath: string,
		projectId: string,
		content: string,
		mode: AgentMode,
		onEvent: (event: StreamEvent) => void,
	): Promise<void> {
		await this.agyPermissions.ensureTrustedWorkspace(projectPath)

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
		onEvent({ type: 'activity', status: 'running', label: 'Thinking...' })

		let agentContent = ''
		let conversationId = session.conversationId ?? ''
		const agentItemId = randomUUID()

		const streamSession = await this.ensureStreamSession(projectId, projectPath, session.conversationId)
		const turnResult = await this.runStreamTurn(streamSession, prompt, mode, projectId, onEvent)
		agentContent = turnResult.agentContent
		conversationId = turnResult.conversationId || conversationId

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
	}

	private async ensureStreamSession(
		projectId: string,
		projectPath: string,
		conversationId: string | null,
	): Promise<StreamSession> {
		const existing = this.streamSessions.get(projectId)
		if (existing && existing.projectPath === projectPath && existing.child.exitCode === null) {
			return existing
		}

		if (existing) {
			existing.child.kill()
			this.streamSessions.delete(projectId)
		}

		const args = [
			'--input-format',
			'stream-json',
			'--output-format',
			'stream-json',
			'--add-dir',
			projectPath,
		]
		if (conversationId) {
			args.push('--conversation', conversationId)
		}

		const child = spawn(this.config.agyPath, args, {
			cwd: projectPath,
			env: { ...process.env, FORCE_COLOR: '0' },
			stdio: ['pipe', 'pipe', 'pipe'],
		})

		const streamSession: StreamSession = {
			child,
			projectPath,
			projectId,
			conversationId: conversationId ?? '',
			stdoutBuffer: '',
		}

		this.streamSessions.set(projectId, streamSession)

		child.on('close', () => {
			if (this.streamSessions.get(projectId)?.child === child) {
				this.streamSessions.delete(projectId)
			}
		})

		child.on('error', () => {
			this.streamSessions.delete(projectId)
		})

		return streamSession
	}

	private async runStreamTurn(
		streamSession: StreamSession,
		prompt: string,
		mode: AgentMode,
		projectId: string,
		onEvent: (event: StreamEvent) => void,
	): Promise<{ agentContent: string; conversationId: string }> {
		const message = { event: 'user', message: { content: prompt } }
		streamSession.child.stdin.write(`${JSON.stringify(message)}\n`)

		let agentContent = ''
		let conversationId = streamSession.conversationId
		const permissionRequests = new Map<string, Promise<boolean>>()

		const requestCommandApproval = (command: string): Promise<boolean> => {
			const normalized = command.trim()
			const existing = permissionRequests.get(normalized)
			if (existing) return existing

			if (this.config.autoApproveTools) {
				const auto = Promise.resolve(true)
				permissionRequests.set(normalized, auto)
				return auto
			}

			const pending = this.permissions.waitForApproval(
				projectId,
				'run_command',
				`Running: ${normalized}`,
				{ CommandLine: normalized },
			)
			permissionRequests.set(normalized, pending)
			return pending
		}

		const handlePermissionCommand = (command: string): void => {
			const normalized = command.trim()
			if (!normalized) return
			void requestCommandApproval(normalized)
		}

		return new Promise((resolve) => {
			let settled = false
			let stdoutBuffer = streamSession.stdoutBuffer
			streamSession.stdoutBuffer = ''
			let awaitingRetryResult = false

			const finish = (result: { agentContent: string; conversationId: string }) => {
				if (settled) return
				settled = true
				cleanup()
				streamSession.stdoutBuffer = stdoutBuffer
				resolve(result)
			}

			const fail = (message: string) => {
				onEvent({ type: 'error', message })
				finish({ agentContent, conversationId })
			}

			const handleResult = async (result: Record<string, unknown>) => {
				conversationId = (result.conversation_id as string) ?? conversationId
				streamSession.conversationId = conversationId
				const status = result.status as string
				if (status === 'ERROR') {
					onEvent({ type: 'error', message: (result.error as string) ?? 'Agent error' })
				}

				if (awaitingRetryResult) {
					finish({ agentContent, conversationId })
					return
				}

				if (permissionRequests.size === 0) {
					finish({ agentContent, conversationId })
					return
				}

				const entries = [...permissionRequests.entries()]
				permissionRequests.clear()

				for (const [cmd, approvalPromise] of entries) {
					const approved = await approvalPromise
					if (!approved) {
						onEvent({
							type: 'activity',
							status: 'error',
							label: `Denied: ${cmd}`,
							toolName: 'run_command',
						})
						continue
					}

					await this.agyPermissions.grantCommand(cmd)
					awaitingRetryResult = true
					this.sendRetryPrompt(streamSession, cmd)
					return
				}

				finish({ agentContent, conversationId })
			}

			const processLine = (line: string) => {
				if (!line.trim()) return
				try {
					const event = JSON.parse(line) as Record<string, unknown>

					if (event.event === 'init' && typeof event.conversation_id === 'string') {
						conversationId = event.conversation_id
						streamSession.conversationId = conversationId
					}

					if (event.event === 'step_update') {
						const update = event.step_update as Record<string, unknown>
						const stepType = update.step_type as string

						if (stepType === 'tool') {
							const toolName = update.tool_name as string
							const toolInfo = (update.tool_info as Record<string, unknown>) ?? {}
							const label = formatToolLabel(toolName, toolInfo)

							if (mode === 'ask' && isWriteTool(toolName)) {
								onEvent({ type: 'activity', status: 'error', label: `Blocked: ${label} (ask mode)`, toolName })
								return
							}

							const toolError = toolInfo.error as { message?: string } | undefined
							if (toolError?.message && /permission/i.test(toolError.message)) {
								const params = (toolInfo.parameters as Record<string, unknown>) ?? {}
								const cmd = params.CommandLine ?? params.command
								if (typeof cmd === 'string') {
									handlePermissionCommand(cmd)
								}
							}

							onEvent({ type: 'activity', status: 'running', label, toolName })
							if (update.state === 'DONE') {
								onEvent({ type: 'activity', status: 'complete', label, toolName })
							}
						}

						if (stepType === 'agent_response' && typeof update.text_delta === 'string') {
							agentContent += update.text_delta
							onEvent({ type: 'message_delta', content: update.text_delta })
						}
					}

					if (event.event === 'result') {
						void handleResult(event.result as Record<string, unknown>)
					}
				} catch {
					// non-json line
				}
			}

			const onStdout = (chunk: Buffer) => {
				stdoutBuffer += chunk.toString()
				const lines = stdoutBuffer.split('\n')
				stdoutBuffer = lines.pop() ?? ''
				for (const line of lines) {
					processLine(line)
				}
			}

			const onStderr = (chunk: Buffer) => {
				const text = chunk.toString()
				if (text.includes('authentication')) {
					fail('Antigravity authentication required. Run `agy` on your laptop and sign in.')
					return
				}

				const deniedMatch = text.match(PERMISSION_DENIED_RE)
				if (deniedMatch?.[1]) {
					handlePermissionCommand(deniedMatch[1])
					return
				}

				const requestMatch = text.match(PERMISSION_REQUEST_RE)
				if (requestMatch?.[1]) {
					handlePermissionCommand(requestMatch[1])
				}
			}

			const onClose = () => {
				if (stdoutBuffer.trim()) processLine(stdoutBuffer)
				if (!settled) {
					fail('Antigravity session closed unexpectedly')
				}
			}

			const cleanup = () => {
				streamSession.child.stdout.off('data', onStdout)
				streamSession.child.stderr.off('data', onStderr)
				streamSession.child.off('close', onClose)
			}

			streamSession.child.stdout.on('data', onStdout)
			streamSession.child.stderr.on('data', onStderr)
			streamSession.child.on('close', onClose)
		})
	}

	private sendRetryPrompt(streamSession: StreamSession, command: string): void {
		const retry = {
			event: 'user',
			message: {
				content: `Permission granted. Run this command now: ${command}`,
			},
		}
		streamSession.child.stdin.write(`${JSON.stringify(retry)}\n`)
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
