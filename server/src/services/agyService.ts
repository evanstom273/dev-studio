import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
	ActivityTimelineItem,
	AgentActivityDetail,
	AgentActivityItem,
	AgentActivityType,
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
import { appendTimelineActivity, appendTimelineCommentary, updateTimelineActivity } from './agent/timeline.js'

type PermissionResolver = (approved: boolean) => void

const MODE_PREFIX: Record<AgentMode, string> = {
	agent:
		'[AGENT MODE] Edit workspace files with replace_file_content, edit_file, or apply_patch. ' +
		'Do not use write_to_file for project source files — that tool is for ephemeral artifacts only.\n\n',
	ask: '[ASK MODE] Answer questions and analyze code only. Do NOT edit files, run commands, or make changes.\n\n',
	plan: '[PLAN MODE] Create a detailed plan for the task. Do NOT execute changes — only outline steps.\n\n',
}

const PERMISSION_DENIED_RE =
	/permission check failed for command "([^"]+)"/i
const PERMISSION_REQUEST_RE = /Requesting permission for:\s*(.+)/i
const AGY_TURN_TIMEOUT_MS = 30 * 60_000
/** agy default is 5m — long agent tasks hit this and exit with code 1. */
const AGY_PRINT_TIMEOUT = '30m'
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

type ActiveProcess = {
	child: ChildProcessWithoutNullStreams
	stopped?: boolean
}

export class AgyService {
	private agyPermissions = new AgyPermissionService()
	private logPath = join(process.env.DEV_STUDIO_DATA_DIR ?? join(homedir(), '.dev-studio'), 'agy.log')
	private cachedModels: string[] | null = null
	private activeProcesses = new Map<string, ActiveProcess>()
	private scratchDir: string

	constructor(
		private config: ServerConfig,
		private sessions: SessionStore,
		private permissions: PermissionQueue,
	) {
		this.scratchDir = join(config.dataDir, 'agy-scratch')
	}

	async init(): Promise<void> {
		await mkdir(this.scratchDir, { recursive: true })
		await this.agyPermissions.init()
	}

	async getAvailableModels(): Promise<string[]> {
		if (this.cachedModels && this.cachedModels.length > 0) return this.cachedModels

		const fallback = [
			'gemini-3.7-flash-high',
			'gemini-3.7-flash-medium',
			'gemini-3.7-flash-low',
			'gemini-3.6-flash-high',
			'gemini-3.5-flash-high',
			'gemini-3.1-pro-high',
			'claude-sonnet-4-6',
			'claude-opus-4-6-thinking',
			'gpt-oss-120b-medium',
		]

		return new Promise((resolve) => {
			const child = spawn(this.config.agyPath, ['models'], {
				stdio: ['ignore', 'pipe', 'pipe'],
				env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
				windowsHide: true,
			})
			let output = ''
			child.stdout?.on('data', (chunk: Buffer) => {
				output += chunk.toString()
			})
			child.stderr?.on('data', (chunk: Buffer) => {
				output += chunk.toString()
			})

			const timeout = setTimeout(() => {
				child.kill()
				this.cachedModels = fallback
				resolve(fallback)
			}, 3000)

			child.on('close', () => {
				clearTimeout(timeout)
				const lines = output.split('\n')
				const models: string[] = []
				for (const line of lines) {
					const trimmed = line.trim()
					if (!trimmed || trimmed.startsWith('Fetching') || trimmed.startsWith('Usage') || trimmed.startsWith('agy')) {
						continue
					}
					const id = trimmed.split('\t')[0].trim().split(' ')[0].trim()
					if (id && !models.includes(id)) {
						models.push(id)
					}
				}
				if (models.length > 0) {
					this.cachedModels = models
					resolve(models)
				} else {
					this.cachedModels = fallback
					resolve(fallback)
				}
			})

			child.on('error', () => {
				clearTimeout(timeout)
				this.cachedModels = fallback
				resolve(fallback)
			})
		})
	}

	stopTurn(projectId: string): boolean {
		const active = this.activeProcesses.get(projectId)
		if (!active) return false
		active.stopped = true
		active.child.kill()
		this.activeProcesses.delete(projectId)
		return true
	}

	resetProjectSession(projectId: string): void {
		const active = this.activeProcesses.get(projectId)
		if (active) {
			active.child.kill()
			this.activeProcesses.delete(projectId)
		}
	}

	async runPrompt(
		projectPath: string,
		projectId: string,
		content: string,
		mode: AgentMode,
		model: string | undefined,
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
		if (model) {
			session.model = model
		}
		await this.sessions.save(session)

		const prompt = `${MODE_PREFIX[mode]}${content}`
		onEvent({ type: 'turn_status', status: 'running', label: 'Thinking…' })

		let agentContent = ''
		let conversationId = session.conversationId ?? ''
		const agentItemId = randomUUID()
		let turnFailed = false
		let timeline: ActivityTimelineItem | undefined

		try {
			const turnResult = await this.runSingleTurn(
				projectPath,
				projectId,
				prompt,
				mode,
				session.conversationId,
				model || session.model,
				onEvent,
			)
			agentContent = turnResult.agentContent
			conversationId = turnResult.conversationId || conversationId
			turnFailed = turnResult.failed
			timeline = turnResult.timeline
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

		if (timeline) {
			timeline.status = turnFailed ? 'error' : 'complete'
			timeline.completedAt = Date.now()
			timeline.durationMs = timeline.completedAt - timeline.startedAt
			if (timeline.activities.length > 0 || timeline.entries?.length) {
				session.items.push(timeline)
			}
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
			durationMs: timeline?.durationMs,
			usage: timeline?.usage,
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

	async runSingleTurn(
		projectPath: string,
		projectId: string,
		prompt: string,
		mode: AgentMode,
		conversationId: string | null,
		model: string | undefined,
		onEvent: (event: StreamEvent) => void,
	): Promise<{ agentContent: string; conversationId: string; failed: boolean; timeline: ActivityTimelineItem }> {
		const useStdin = Buffer.byteLength(prompt, 'utf8') > STDIN_PROMPT_BYTES
		const resolvedProjectPath = resolve(projectPath)
		// Repo access via --add-dir; cwd must stay outside the repo or agy sandboxes writes to brain/ only.
		const args = ['--add-dir', resolvedProjectPath, '--output-format', 'stream-json', '--print-timeout', AGY_PRINT_TIMEOUT]
		if (this.config.autoApproveTools) {
			args.push('--dangerously-skip-permissions')
		}
		if (model) {
			args.push('--model', model)
		}
		if (conversationId) {
			args.push('--conversation', conversationId)
		}
		if (!useStdin) {
			args.unshift('-p', prompt)
		}

		await this.logAgy(
			`turn start project=${projectId} path=${resolvedProjectPath} cwd=${this.scratchDir} stdin=${useStdin} bytes=${Buffer.byteLength(prompt, 'utf8')}`,
		)

		const child = spawn(this.config.agyPath, args, {
			cwd: this.scratchDir,
			env: { ...process.env, FORCE_COLOR: '0', CI: 'true' },
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		})

		const activeProcess: ActiveProcess = { child }
		this.activeProcesses.set(projectId, activeProcess)

		if (useStdin) {
			child.stdin.write(prompt)
			child.stdin.end()
		}

		return this.consumeAgyStream(child, activeProcess, projectId, projectPath, mode, onEvent)
	}

	private async consumeAgyStream(
		child: ChildProcessWithoutNullStreams,
		activeProcess: ActiveProcess,
		projectId: string,
		projectPath: string,
		mode: AgentMode,
		onEvent: (event: StreamEvent) => void,
	): Promise<{ agentContent: string; conversationId: string; failed: boolean; timeline: ActivityTimelineItem }> {
		let agentContent = ''
		let conversationId = ''
		let failed = false
		let stdoutBuffer = ''
		let stderrBuffer = ''
		const permissionRequests = new Map<string, Promise<boolean>>()

		const timeline: ActivityTimelineItem = {
			id: `timeline-${randomUUID()}`,
			kind: 'activity_timeline',
			status: 'running',
			startedAt: Date.now(),
			activities: [],
			entries: [],
			timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
		}
		const activeActivities = new Map<string, AgentActivityItem>()

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

			const finish = (result: { agentContent: string; conversationId: string; failed: boolean; timeline: ActivityTimelineItem }) => {
				if (settled) return
				settled = true
				clearTimeout(turnTimeout)
				if (this.activeProcesses.get(projectId)?.child === child) {
					this.activeProcesses.delete(projectId)
				}
				for (const act of activeActivities.values()) {
					if (act.status === 'running') {
						act.status = result.failed ? 'failed' : 'completed'
						act.completedAt = Date.now()
						act.durationMs = act.completedAt - act.startedAt
					}
				}
				timeline.completedAt = Date.now()
				timeline.durationMs = timeline.completedAt - timeline.startedAt
				timeline.status = result.failed ? 'error' : 'complete'
				resolve({ ...result, timeline })
			}

			const fail = (message: string) => {
				failed = true
				const formatted = formatAgyError(message, stderrBuffer)
				void this.logAgy(`turn fail: ${formatted}`)
				const errorActivity: AgentActivityItem = {
					id: `act-${randomUUID()}`,
					type: 'error',
					status: 'failed',
					title: 'Agent failed',
					detail: { error: formatted },
					startedAt: Date.now(),
					completedAt: Date.now(),
					durationMs: 0,
				}
				appendTimelineActivity(timeline, errorActivity)
				onEvent({ type: 'activity_complete', activity: errorActivity })
				onEvent({ type: 'error', message: formatted })
				finish({ agentContent, conversationId, failed: true, timeline })
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
				timeline.usage = usage
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
						const stepKey = String(update.step_id || update.tool_name || randomUUID())

						if (stepType === 'tool') {
							const toolName = update.tool_name as string
							const toolInfo = (update.tool_info as Record<string, unknown>) ?? {}
							const label = formatToolLabel(toolName, toolInfo)
							const parsed = parseToolActivity(toolName, toolInfo, projectPath)

							if (mode === 'ask' && isWriteTool(toolName)) {
								const blockActivity: AgentActivityItem = {
									id: `act-${randomUUID()}`,
									type: 'error',
									status: 'failed',
									title: `Blocked: ${label} (ask mode)`,
									detail: { error: 'Write operations are blocked in ask mode' },
									startedAt: Date.now(),
									completedAt: Date.now(),
									durationMs: 0,
									toolName: shortToolName(toolName),
								}
								appendTimelineActivity(timeline, blockActivity)
								onEvent({ type: 'activity_complete', activity: blockActivity })
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

							const isDone = update.state === 'DONE' || update.state === 'ERROR'
							const stepDurationMs = toDurationMs(update.duration_seconds)
							const stepUsage = parseUsage(update.usage)
							const failedStep = update.state === 'ERROR' || Boolean(parsed.detail.error)

							let activityItem = activeActivities.get(stepKey)

							if (!activityItem) {
								activityItem = {
									id: `act-${randomUUID()}`,
									type: failedStep ? 'error' : parsed.type,
									status: failedStep ? 'failed' : isDone ? 'completed' : 'running',
									title: failedStep && parsed.detail.error
										? parsed.title
										: parsed.title,
									detail: parsed.detail,
									startedAt: Date.now() - (stepDurationMs ?? 0),
									completedAt: isDone ? Date.now() : undefined,
									durationMs: stepDurationMs,
									toolName: shortToolName(toolName),
								}
								appendTimelineActivity(timeline, activityItem)
								if (!isDone) {
									activeActivities.set(stepKey, activityItem)
									onEvent({ type: 'activity_start', activity: { ...activityItem } })
								} else {
									updateTimelineActivity(timeline, activityItem)
									onEvent({ type: 'activity_complete', activity: { ...activityItem } })
								}
							} else {
								activityItem.status = failedStep ? 'failed' : isDone ? 'completed' : 'running'
								activityItem.type = failedStep ? 'error' : activityItem.type
								activityItem.title = parsed.title || activityItem.title
								activityItem.detail = { ...activityItem.detail, ...parsed.detail }
								if (isDone) {
									activityItem.completedAt = Date.now()
									activityItem.durationMs = stepDurationMs ?? (activityItem.completedAt - activityItem.startedAt)
									activeActivities.delete(stepKey)
									onEvent({ type: 'activity_complete', activity: { ...activityItem } })
								} else {
									onEvent({ type: 'activity_start', activity: { ...activityItem } })
								}
							}

							if (!isDone) return

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

						if (stepType === 'status' || (update.status_message && typeof update.status_message === 'string')) {
							const msg = String(update.status_message || update.label || '')
							if (msg.trim()) {
								const statusActivity: AgentActivityItem = {
									id: `act-${randomUUID()}`,
									type: 'status',
									status: 'completed',
									title: msg,
									startedAt: Date.now(),
									completedAt: Date.now(),
									durationMs: 0,
								}
								appendTimelineCommentary(timeline, msg)
								onEvent({ type: 'commentary_delta', content: msg })
							}
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

				if (activeProcess.stopped || child.killed) {
					onEvent({ type: 'done', conversationId: conversationId ?? '', status: 'STOPPED', durationMs: Date.now() - timeline.startedAt })
					finish({ agentContent, conversationId, failed: false, timeline })
					return
				}

				if (code !== 0 && code !== null) {
					fail(formatAgyError(`Antigravity exited with code ${code}`, stderrBuffer))
					return
				}

				if (failed) {
					finish({ agentContent, conversationId, failed: true, timeline })
					return
				}

				finish({ agentContent, conversationId, failed: false, timeline })
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

function parseToolActivity(
	toolName: string,
	toolInfo: Record<string, unknown>,
	projectPath?: string,
): { type: AgentActivityType; title: string; detail: AgentActivityDetail } {
	const params = (toolInfo.parameters as Record<string, unknown>) ?? {}
	const toolSummary = typeof toolInfo.toolSummary === 'string' ? toolInfo.toolSummary : undefined
	const toolAction = typeof toolInfo.toolAction === 'string' ? toolInfo.toolAction : undefined
	const errorObj = toolInfo.error as { message?: string } | string | undefined
	const errorStr = typeof errorObj === 'string' ? errorObj : errorObj?.message
	const resultObj = toolInfo.result as Record<string, unknown> | string | undefined
	let outputStr: string | undefined
	if (typeof resultObj === 'string') {
		outputStr = resultObj
	} else if (resultObj && typeof resultObj === 'object') {
		outputStr = typeof resultObj.output === 'string' ? resultObj.output : typeof resultObj.stdout === 'string' ? resultObj.stdout : undefined
	}

	const shortPath = (p: unknown): string => {
		if (typeof p !== 'string' || !p) return ''
		let clean = p.replace(/\\/g, '/')
		if (projectPath) {
			const normProj = projectPath.replace(/\\/g, '/')
			if (clean.startsWith(normProj)) {
				clean = clean.slice(normProj.length).replace(/^\//, '')
			}
		}
		return clean
	}

	const baseName = (p: unknown): string => {
		const s = shortPath(p)
		return s.split('/').pop() || s
	}

	// 1. File read
	if (toolName.includes('view_file') || toolName.includes('read_file')) {
		const rawPath = params.AbsolutePath ?? params.FilePath ?? params.path ?? params.file_path
		const fullRel = shortPath(rawPath)
		const base = baseName(rawPath)
		const startLine = typeof params.StartLine === 'number' ? params.StartLine : undefined
		const endLine = typeof params.EndLine === 'number' ? params.EndLine : undefined
		const title = toolSummary || (base ? `Read \`${base}\`` : 'Read file')
		return {
			type: 'read',
			title,
			detail: {
				filePath: fullRel || base,
				startLine,
				endLine,
				summary: toolSummary,
				action: toolAction,
				output: outputStr,
				error: errorStr,
			},
		}
	}

	// 2. File edit
	if (
		toolName.includes('replace_file_content') ||
		toolName.includes('write_to_file') ||
		toolName.includes('edit_file') ||
		toolName.includes('apply_patch')
	) {
		const rawPath = params.TargetFile ?? params.FilePath ?? params.path ?? params.file_path
		const fullRel = shortPath(rawPath)
		const base = baseName(rawPath)
		const instruction = typeof params.Instruction === 'string' ? params.Instruction : typeof params.Description === 'string' ? params.Description : undefined

		let additions: number | undefined
		let deletions: number | undefined
		let diffSnippet: string | undefined

		if (toolName.includes('replace_file_content')) {
			const targetContent = typeof params.TargetContent === 'string' ? params.TargetContent : ''
			const replacementContent = typeof params.ReplacementContent === 'string' ? params.ReplacementContent : ''
			deletions = targetContent ? targetContent.split('\n').length : 0
			additions = replacementContent ? replacementContent.split('\n').length : 0
			if (targetContent || replacementContent) {
				diffSnippet = `--- ${base}\n+++ ${base}\n` +
					(targetContent ? targetContent.split('\n').map((l) => `- ${l}`).join('\n') + '\n' : '') +
					(replacementContent ? replacementContent.split('\n').map((l) => `+ ${l}`).join('\n') : '')
			}
		} else if (toolName.includes('write_to_file')) {
			const codeContent = typeof params.CodeContent === 'string' ? params.CodeContent : ''
			additions = codeContent ? codeContent.split('\n').length : 0
			deletions = 0
		}

		const title = toolSummary || (base ? `Edited \`${base}\`` : 'Edited file')
		return {
			type: 'edit',
			title,
			detail: {
				filePath: fullRel || base,
				instruction,
				additions,
				deletions,
				diff: diffSnippet,
				summary: toolSummary,
				action: toolAction,
				error: errorStr,
			},
		}
	}

	// 3. Command / Shell / Git
	if (toolName.includes('run_command') || toolName.includes('bash') || toolName.includes('exec') || toolName.includes('powershell')) {
		const cmd = String(params.CommandLine ?? params.command ?? params.cmd ?? '').trim()
		if (cmd.startsWith('git ') || cmd.startsWith('gh ')) {
			let gitTitle = toolSummary
			if (!gitTitle) {
				if (cmd.includes('checkout -b') || cmd.includes('switch -c')) {
					const branchName = cmd.split(/\s+/).pop() ?? ''
					gitTitle = `Created branch ${branchName}`
				} else if (cmd.includes('commit')) {
					gitTitle = 'Committed changes'
				} else if (cmd.includes('push')) {
					gitTitle = 'Pushed branch'
				} else if (cmd.includes('pr create')) {
					gitTitle = 'Created PR'
				} else {
					gitTitle = `$ ${cmd}`
				}
			}
			return {
				type: 'git',
				title: gitTitle,
				detail: {
					command: cmd,
					output: outputStr,
					error: errorStr,
					summary: toolSummary,
					action: toolAction,
				},
			}
		}

		const title = toolSummary || (cmd ? `$ ${cmd}` : 'Run command')
		return {
			type: 'command',
			title,
			detail: {
				command: cmd,
				output: outputStr,
				error: errorStr,
				summary: toolSummary,
				action: toolAction,
			},
		}
	}

	// 4. Search
	if (toolName.includes('grep_search') || toolName.includes('find_by_name') || toolName.includes('search_web')) {
		const query = String(params.Query ?? params.Pattern ?? params.query ?? params.pattern ?? '').trim()
		const searchPath = shortPath(params.SearchPath ?? params.SearchDirectory ?? params.path ?? params.dir)
		let title = toolSummary
		if (!title) {
			if (query) {
				title = `Searched for "${query}"`
			} else if (searchPath) {
				title = `Searched in \`${searchPath}\``
			} else {
				title = 'Searched codebase'
			}
		}
		return {
			type: 'search',
			title,
			detail: {
				query: query || undefined,
				directory: searchPath || undefined,
				output: outputStr,
				error: errorStr,
				summary: toolSummary,
				action: toolAction,
			},
		}
	}

	// 5. List dir
	if (toolName.includes('list_dir')) {
		const dirPath = shortPath(params.DirectoryPath ?? params.path ?? params.dir)
		const base = baseName(dirPath)
		const title = toolSummary || (base ? `Listed directory \`${base}\`` : 'Listed directory')
		return {
			type: 'tool',
			title,
			detail: {
				directory: dirPath,
				summary: toolSummary,
				action: toolAction,
				output: outputStr,
				error: errorStr,
			},
		}
	}

	// 6. Generic tool
	const fallbackTitle = toolSummary || toolAction || shortToolName(toolName)
	return {
		type: errorStr ? 'error' : 'tool',
		title: errorStr ? (toolSummary || shortToolName(toolName)) : fallbackTitle,
		detail: {
			summary: toolSummary,
			action: toolAction,
			error: errorStr,
			output: outputStr,
		},
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
