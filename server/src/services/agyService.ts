import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
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
const AGY_STARTUP_TIMEOUT_MS = 90_000
const AGY_TURN_TIMEOUT_MS = 30 * 60_000

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
	ready: boolean
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

	resetProjectSession(projectId: string): void {
		const existing = this.streamSessions.get(projectId)
		if (!existing) return
		killSession(existing)
		this.streamSessions.delete(projectId)
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
			const streamSession = await this.ensureStreamSession(projectId, projectPath, session.conversationId)
			const turnResult = await this.runStreamTurn(streamSession, prompt, mode, projectId, onEvent)
			agentContent = turnResult.agentContent
			conversationId = turnResult.conversationId || conversationId
			turnFailed = turnResult.failed
		} catch (error) {
			turnFailed = true
			const message = error instanceof Error ? error.message : 'Agent failed'
			onEvent({ type: 'error', message })
			this.resetProjectSession(projectId)
			session.conversationId = null
		}

		if (turnFailed) {
			this.resetProjectSession(projectId)
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

	private async ensureStreamSession(
		projectId: string,
		projectPath: string,
		conversationId: string | null,
	): Promise<StreamSession> {
		const existing = this.streamSessions.get(projectId)
		if (existing && existing.projectPath === projectPath && isProcessAlive(existing.child) && existing.ready) {
			return existing
		}

		if (existing) {
			killSession(existing)
			this.streamSessions.delete(projectId)
		}

		try {
			return await this.spawnStreamSession(projectId, projectPath, conversationId)
		} catch (error) {
			if (conversationId) {
				return this.spawnStreamSession(projectId, projectPath, null)
			}
			throw error
		}
	}

	private async spawnStreamSession(
		projectId: string,
		projectPath: string,
		conversationId: string | null,
	): Promise<StreamSession> {
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
			ready: false,
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

		const boot = await waitForAgyInit(child, AGY_STARTUP_TIMEOUT_MS)
		streamSession.conversationId = boot.conversationId
		streamSession.stdoutBuffer = boot.leftoverBuffer
		streamSession.ready = true

		return streamSession
	}

	private async runStreamTurn(
		streamSession: StreamSession,
		prompt: string,
		mode: AgentMode,
		projectId: string,
		onEvent: (event: StreamEvent) => void,
	): Promise<{ agentContent: string; conversationId: string; failed: boolean }> {
		if (!isProcessAlive(streamSession.child)) {
			throw new Error('Antigravity process is not running')
		}

		let agentContent = ''
		let conversationId = streamSession.conversationId
		const permissionRequests = new Map<string, Promise<boolean>>()
		let failed = false

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
			let stderrBuffer = ''
			let awaitingRetryResult = false

			const finish = (result: { agentContent: string; conversationId: string; failed: boolean }) => {
				if (settled) return
				settled = true
				clearTimeout(turnTimeout)
				cleanup()
				streamSession.stdoutBuffer = stdoutBuffer
				resolve(result)
			}

			const fail = (message: string) => {
				failed = true
				onEvent({ type: 'error', message: formatAgyError(message, stderrBuffer) })
				finish({ agentContent, conversationId, failed: true })
			}

			const emitTurnComplete = (result: Record<string, unknown>) => {
				const usage = parseUsage(result.usage)
				const durationMs = toDurationMs(result.duration_seconds)
				const tokensPerSecond = calcTokensPerSecond(usage, durationMs)
				this.emitTurnStatus(onEvent, {
					status: 'complete',
					label: 'Done',
					durationMs,
					usage,
					tokensPerSecond,
				})
			}

			const handleResult = async (result: Record<string, unknown>) => {
				conversationId = (result.conversation_id as string) ?? conversationId
				streamSession.conversationId = conversationId
				const status = result.status as string
				if (status === 'ERROR') {
					failed = true
					onEvent({ type: 'error', message: (result.error as string) ?? 'Agent error' })
				}

				if (awaitingRetryResult) {
					emitTurnComplete(result)
					finish({ agentContent, conversationId, failed })
					return
				}

				if (permissionRequests.size === 0) {
					emitTurnComplete(result)
					finish({ agentContent, conversationId, failed })
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

				finish({ agentContent, conversationId, failed })
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
			}

			const onClose = (code: number | null) => {
				if (stdoutBuffer.trim()) processLine(stdoutBuffer)
				if (!settled) {
					fail(
						code === null
							? 'Antigravity session closed unexpectedly'
							: `Antigravity exited with code ${code}`,
					)
				}
			}

			const cleanup = () => {
				streamSession.child.stdout.off('data', onStdout)
				streamSession.child.stderr.off('data', onStderr)
				streamSession.child.off('close', onClose)
			}

			const turnTimeout = setTimeout(() => {
				if (!settled) {
					fail(`Antigravity turn timed out after ${Math.round(AGY_TURN_TIMEOUT_MS / 60_000)} minutes`)
					killSession(streamSession)
				}
			}, AGY_TURN_TIMEOUT_MS)

			streamSession.child.stdout.on('data', onStdout)
			streamSession.child.stderr.on('data', onStderr)
			streamSession.child.on('close', onClose)

			// Drain any init/boot lines captured during startup before this turn's listeners existed.
			if (stdoutBuffer) {
				const pending = stdoutBuffer
				stdoutBuffer = ''
				for (const line of pending.split('\n')) {
					processLine(line)
				}
			}

			writeStreamJson(streamSession.child, { event: 'user', message: { content: prompt } }).catch((err) => {
				fail(err instanceof Error ? err.message : 'Failed to send prompt to Antigravity')
			})
		})
	}

	private sendRetryPrompt(streamSession: StreamSession, command: string): void {
		const retry = {
			event: 'user',
			message: {
				content: `Permission granted. Run this command now: ${command}`,
			},
		}
		void writeStreamJson(streamSession.child, retry)
	}
}

function isProcessAlive(child: ChildProcessWithoutNullStreams): boolean {
	return !child.killed && child.exitCode === null && child.signalCode === null
}

function killSession(session: StreamSession): void {
	if (!isProcessAlive(session.child)) return
	session.child.kill()
}

async function writeStreamJson(
	child: ChildProcessWithoutNullStreams,
	payload: Record<string, unknown>,
): Promise<void> {
	if (!isProcessAlive(child)) {
		throw new Error('Antigravity process is not running')
	}

	const line = `${JSON.stringify(payload)}\n`
	await new Promise<void>((resolve, reject) => {
		const ok = child.stdin.write(line, (err) => {
			if (err) reject(err)
		})
		if (ok) {
			resolve()
			return
		}
		child.stdin.once('drain', resolve)
		child.stdin.once('error', reject)
	})
}

function waitForAgyInit(
	child: ChildProcessWithoutNullStreams,
	timeoutMs: number,
): Promise<{ conversationId: string; leftoverBuffer: string }> {
	return new Promise((resolve, reject) => {
		let stdoutBuffer = ''
		let stderrBuffer = ''

		const timeout = setTimeout(() => {
			cleanup()
			reject(new Error(formatAgyError('Antigravity startup timed out', stderrBuffer)))
		}, timeoutMs)

		const onStdout = (chunk: Buffer) => {
			stdoutBuffer += chunk.toString()
			const lines = stdoutBuffer.split('\n')
			stdoutBuffer = lines.pop() ?? ''
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i]
				if (!line.trim()) continue
				try {
					const event = JSON.parse(line) as Record<string, unknown>
					if (event.event === 'init') {
						cleanup()
						const leftover = [...lines.slice(i + 1), stdoutBuffer].filter((part) => part.length > 0).join('\n')
						resolve({
							conversationId: typeof event.conversation_id === 'string' ? event.conversation_id : '',
							leftoverBuffer: leftover ? `${leftover}\n` : '',
						})
						return
					}
				} catch {
					// non-json line during boot
				}
			}
		}

		const onStderr = (chunk: Buffer) => {
			stderrBuffer += chunk.toString()
		}

		const onClose = (code: number | null) => {
			cleanup()
			reject(
				new Error(
					formatAgyError(
						code === null ? 'Antigravity exited during startup' : `Antigravity exited during startup (code ${code})`,
						stderrBuffer,
					),
				),
			)
		}

		const cleanup = () => {
			clearTimeout(timeout)
			child.stdout.off('data', onStdout)
			child.stderr.off('data', onStderr)
			child.off('close', onClose)
		}

		child.stdout.on('data', onStdout)
		child.stderr.on('data', onStderr)
		child.once('close', onClose)
	})
}

function formatAgyError(message: string, stderr: string): string {
	const detail = stderr.trim().split('\n').slice(-4).join(' ').trim()
	if (!detail) return message
	if (message.includes(detail)) return message
	return `${message}: ${detail}`
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
