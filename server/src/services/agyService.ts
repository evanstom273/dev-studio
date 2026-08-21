import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
	AgentMode,
	ConversationItem,
	PermissionRequest,
	StreamEvent,
	TokenUsage,
	TurnToolEntry,
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
const AGY_TURN_TIMEOUT_MS = 30 * 60_000
/** Above this size, pass the prompt on stdin (text mode) instead of -p (Windows argv limits). */
const STDIN_PROMPT_BYTES = 3500

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
	private agyPermissions = new AgyPermissionService()
	private logPath = join(process.env.DEV_STUDIO_DATA_DIR ?? join(homedir(), '.dev-studio'), 'agy.log')

	constructor(
		private config: ServerConfig,
		private sessions: SessionStore,
		private permissions: PermissionQueue,
	) {}

	async init(): Promise<void> {
		await this.agyPermissions.init()
	}

	resetProjectSession(_projectId: string): void {
		// Per-turn agy processes; nothing persistent to kill. Session reset clears conversationId in the route.
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
		onEvent({ type: 'turn_status', status: 'running', label: 'Thinking…' })

		let agentContent = ''
		let conversationId = session.conversationId ?? ''
		const agentItemId = randomUUID()
		let turnFailed = false

		try {
			const turnResult = await this.runSingleTurn(
				projectPath,
				projectId,
				prompt,
				mode,
				session.conversationId,
				onEvent,
			)
			agentContent = turnResult.agentContent
			conversationId = turnResult.conversationId || conversationId
			turnFailed = turnResult.failed
		} catch (error) {
			turnFailed = true
			const message = error instanceof Error ? error.message : 'Agent failed'
			onEvent({ type: 'error', message })
			conversationId = ''
		}

		if (turnFailed) {
			session.conversationId = null
		} else if (conversationId) {
			session.conversationId = conversationId
		}

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

		session.updatedAt = new Date().toISOString()
		await this.sessions.save(session)

		onEvent({
			type: 'done',
			conversationId: session.conversationId ?? '',
			status: turnFailed ? 'ERROR' : 'SUCCESS',
		})
	}

	private emitTurnStatus(
		onEvent: (event: StreamEvent) => void,
		patch: {
			status: 'running' | 'complete'
			label: string
			durationMs?: number
			usage?: TokenUsage
			tokensPerSecond?: number
			tool?: TurnToolEntry
		},
	): void {
		onEvent({ type: 'turn_status', ...patch })
	}

	private async runSingleTurn(
		projectPath: string,
		projectId: string,
		prompt: string,
		mode: AgentMode,
		conversationId: string | null,
		onEvent: (event: StreamEvent) => void,
	): Promise<{ agentContent: string; conversationId: string; failed: boolean }> {
		const useStdin = Buffer.byteLength(prompt, 'utf8') > STDIN_PROMPT_BYTES
		const args = ['--output-format', 'stream-json']
		if (conversationId) {
			args.push('--conversation', conversationId)
		}
		if (!useStdin) {
			args.unshift('-p', prompt)
		}

		await this.logAgy(`turn start project=${projectId} stdin=${useStdin} bytes=${Buffer.byteLength(prompt, 'utf8')}`)

		const child = spawn(this.config.agyPath, args, {
			cwd: projectPath,
			env: { ...process.env, FORCE_COLOR: '0', CI: 'true' },
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		})

		if (useStdin) {
			child.stdin.write(prompt)
			child.stdin.end()
		}

		return this.consumeAgyStream(child, projectId, mode, onEvent)
	}

	private async consumeAgyStream(
		child: ChildProcessWithoutNullStreams,
		projectId: string,
		mode: AgentMode,
		onEvent: (event: StreamEvent) => void,
	): Promise<{ agentContent: string; conversationId: string; failed: boolean }> {
		let agentContent = ''
		let conversationId = ''
		let failed = false
		let stdoutBuffer = ''
		let stderrBuffer = ''
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
			void requestCommandApproval(normalized).then(async (approved) => {
				if (approved) {
					await this.agyPermissions.grantCommand(normalized)
				}
			})
		}

		return new Promise((resolve) => {
			let settled = false

			const finish = (result: { agentContent: string; conversationId: string; failed: boolean }) => {
				if (settled) return
				settled = true
				clearTimeout(turnTimeout)
				resolve(result)
			}

			const fail = (message: string) => {
				failed = true
				const formatted = formatAgyError(message, stderrBuffer)
				void this.logAgy(`turn fail: ${formatted}`)
				onEvent({ type: 'error', message: formatted })
				finish({ agentContent, conversationId, failed: true })
			}

			const handleResult = (result: Record<string, unknown>) => {
				conversationId = (result.conversation_id as string) ?? conversationId
				const status = result.status as string
				if (status === 'ERROR') {
					failed = true
					onEvent({ type: 'error', message: (result.error as string) ?? 'Agent error' })
				}

				const usage = parseUsage(result.usage)
				const durationMs = toDurationMs(result.duration_seconds)
				this.emitTurnStatus(onEvent, {
					status: 'complete',
					label: 'Done',
					durationMs,
					usage,
					tokensPerSecond: calcTokensPerSecond(usage, durationMs),
				})
			}

			const processLine = (line: string) => {
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

							if (update.state !== 'DONE') return

							const stepUsage = parseUsage(update.usage)
							const stepDurationMs = toDurationMs(update.duration_seconds)
							this.emitTurnStatus(onEvent, {
								status: 'running',
								label: 'Thinking…',
								durationMs: stepDurationMs,
								usage: stepUsage,
								tokensPerSecond: calcTokensPerSecond(stepUsage, stepDurationMs),
								tool: {
									name: shortToolName(toolName),
									label,
									durationMs: stepDurationMs,
								},
							})
						}

						if (stepType === 'agent_response') {
							if (typeof update.text_delta === 'string') {
								agentContent += update.text_delta
								onEvent({ type: 'message_delta', content: update.text_delta })
							}
							if (update.state === 'DONE') {
								const stepUsage = parseUsage(update.usage)
								const stepDurationMs = toDurationMs(update.duration_seconds)
								this.emitTurnStatus(onEvent, {
									status: 'running',
									label: 'Thinking…',
									durationMs: stepDurationMs,
									usage: stepUsage,
									tokensPerSecond: calcTokensPerSecond(stepUsage, stepDurationMs),
								})
							}
						}
					}

					if (event.event === 'result') {
						handleResult(event.result as Record<string, unknown>)
					}
				} catch {
					// non-json line
				}
			}

			child.stdout.on('data', (chunk: Buffer) => {
				stdoutBuffer += chunk.toString()
				const lines = stdoutBuffer.split('\n')
				stdoutBuffer = lines.pop() ?? ''
				for (const line of lines) {
					processLine(line)
				}
			})

			child.stderr.on('data', (chunk: Buffer) => {
				const text = chunk.toString()
				stderrBuffer += text
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
			})

			child.on('error', (err) => {
				fail(err.message)
			})

			child.on('close', (code) => {
				if (stdoutBuffer.trim()) processLine(stdoutBuffer)
				void this.logAgy(`turn exit code=${code ?? 'null'} stderr=${stderrBuffer.trim().slice(0, 500)}`)

				if (settled) return

				if (code !== 0 && code !== null) {
					fail(formatAgyError(`Antigravity exited with code ${code}`, stderrBuffer))
					return
				}

				if (failed) {
					finish({ agentContent, conversationId, failed: true })
					return
				}

				finish({ agentContent, conversationId, failed: false })
			})

			const turnTimeout = setTimeout(() => {
				if (!settled) {
					child.kill()
					fail(`Antigravity turn timed out after ${Math.round(AGY_TURN_TIMEOUT_MS / 60_000)} minutes`)
				}
			}, AGY_TURN_TIMEOUT_MS)
		})
	}

	private async logAgy(message: string): Promise<void> {
		try {
			await appendFile(this.logPath, `[${new Date().toISOString()}] ${message}\n`)
		} catch {
			// ignore
		}
	}
}

function formatAgyError(message: string, stderr: string): string {
	const detail = stderr.trim().split('\n').filter(Boolean).slice(-6).join(' | ').trim()
	if (!detail) return message
	if (message.includes(detail)) return message
	return `${message} — ${detail}`
}

function isWriteTool(toolName: string): boolean {
	return ['write_to_file', 'run_command', 'edit_file', 'apply_patch'].some((t) => toolName.includes(t))
}

function formatToolLabel(toolName: string, info?: Record<string, unknown>): string {
	if (toolName.includes('run_command')) {
		const params = info?.parameters as Record<string, unknown> | undefined
		const cmd = params?.CommandLine ?? params?.command
		return cmd ? String(cmd) : 'shell'
	}
	if (toolName.includes('write') || toolName.includes('edit')) {
		const params = info?.parameters as Record<string, unknown> | undefined
		const file = params?.path ?? params?.file_path ?? params?.FilePath
		return file ? String(file) : 'edit'
	}
	if (toolName.includes('view_file') || toolName.includes('read_file')) {
		const params = info?.parameters as Record<string, unknown> | undefined
		const file = params?.path ?? params?.file_path ?? params?.FilePath
		return file ? String(file) : 'read'
	}
	if (toolName.includes('list_dir')) {
		const params = info?.parameters as Record<string, unknown> | undefined
		const dir = params?.path ?? params?.directory
		return dir ? String(dir) : 'list_dir'
	}
	if (toolName.includes('find_by_name')) {
		const params = info?.parameters as Record<string, unknown> | undefined
		const query = params?.query ?? params?.pattern ?? params?.name
		return query ? String(query) : 'find'
	}
	return shortToolName(toolName)
}

function shortToolName(toolName: string): string {
	if (toolName.includes('list_dir')) return 'list_dir'
	if (toolName.includes('find_by_name')) return 'find'
	if (toolName.includes('view_file') || toolName.includes('read_file')) return 'read'
	if (toolName.includes('run_command')) return 'shell'
	if (toolName.includes('write') || toolName.includes('edit')) return 'edit'
	const base = toolName.split('.').pop() ?? toolName
	return base.length > 24 ? `${base.slice(0, 24)}…` : base
}

function parseUsage(raw: unknown): TokenUsage | undefined {
	if (!raw || typeof raw !== 'object') return undefined
	const usage = raw as Record<string, unknown>
	return {
		inputTokens: asNumber(usage.input_tokens),
		outputTokens: asNumber(usage.output_tokens),
		thinkingTokens: asNumber(usage.thinking_tokens),
		totalTokens: asNumber(usage.total_tokens),
		cacheReadTokens: asNumber(usage.cache_read_tokens),
	}
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toDurationMs(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 1000) : undefined
}

function calcTokensPerSecond(usage: TokenUsage | undefined, durationMs: number | undefined): number | undefined {
	if (!usage || !durationMs || durationMs <= 0) return undefined
	const tokens = (usage.outputTokens ?? 0) + (usage.thinkingTokens ?? 0)
	if (tokens <= 0) return undefined
	return tokens / (durationMs / 1000)
}
