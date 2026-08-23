import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type {
	ActivityTimelineItem,
	AgentActivityItem,
	AgentMode,
	AgentModelDefinition,
	ProviderStatusInfo,
	StreamEvent,
	TokenUsage,
} from '../../types/agent.js'
import type { AgentProvider, SessionTurnContext, TurnExecutionResult } from './agentProvider.js'
import { setLatestCodexRateLimits, type CodexRateLimitsPayload } from '../codexQuotaService.js'
import type { ServerConfig } from '../../config.js'
import {
	createRunningActivityFromCodexItem,
	finalizeActivityFromCodexItem,
	isCodexCommentaryItemType,
	isCodexToolActivityItemType,
	type CodexStreamItem,
} from './codexItemParser.js'
import { appendTimelineActivity, appendTimelineCommentary, updateTimelineActivity } from './timeline.js'

type ActiveProcess = {
	child: ChildProcessWithoutNullStreams
	stopped?: boolean
}

const CODEX_MODE_PROMPT_PREFIX: Record<AgentMode, string> = {
	agent:
		'[AGENT MODE] You are a coding agent working directly in Dev Studio. Inspect, edit, and test files in the project workspace as needed.\n' +
		'[SUBAGENTS] Codex native subagents are enabled. When independent subtasks can run in parallel, spawn subagents with spawn_agent and wait for their results before continuing.\n\n',
	ask: '[ASK MODE] Answer questions and analyze code only. Do NOT edit files, run commands, or make changes.\n\n',
	plan: '[PLAN MODE] Create a detailed implementation plan for the task. Do NOT execute changes — only outline steps.\n\n',
}

export function buildCodexExecArgs(options: {
	threadId?: string | null
	model?: string
	reasoningEffort?: string
	speed?: string
	mode: AgentMode
	autoApprove?: boolean
}): string[] {
	const args: string[] = []
	const isResume = Boolean(options.threadId)

	if (isResume) {
		args.push('exec', 'resume', options.threadId!, '--json', '--skip-git-repo-check')
	} else {
		args.push('exec', '--json', '--skip-git-repo-check')
	}

	const sandboxMode = options.mode === 'agent' ? 'workspace-write' : 'read-only'

	if (options.autoApprove) {
		args.push('-c', 'approval_policy="never"')
	}

	args.push('-c', 'agents.enabled=true')

	if (options.model) {
		const cleanModel = options.model.replace(/^(codex|openai):/, '')
		args.push('-m', cleanModel)
	}

	if (options.reasoningEffort) {
		args.push('-c', `model_reasoning_effort="${options.reasoningEffort}"`)
	}

	if (options.speed && options.speed !== 'default') {
		args.push('-c', `service_tier="${options.speed}"`)
	}

	if (isResume) {
		args.push('-c', `sandbox_mode="${sandboxMode}"`)
	} else {
		args.push('-s', sandboxMode)
	}

	args.push('-')
	return args
}

export class CodexProvider implements AgentProvider {
	readonly id = 'codex' as const
	readonly displayName = 'OpenAI Codex'

	private activeProcesses = new Map<string, ActiveProcess>()
	private resolvedExec: { execPath: string; isNodeJs: boolean } | null = null
	private cachedStatus: ProviderStatusInfo | null = null
	private lastStatusCheck = 0

	constructor(private config?: ServerConfig) {}

	async init(): Promise<void> {
		this.findExecutable()
	}

	private findExecutable(): { execPath: string; isNodeJs: boolean } | null {
		if (this.resolvedExec && existsSync(this.resolvedExec.execPath)) {
			return this.resolvedExec
		}

		const appData = process.env.APPDATA || (process.platform === 'win32' ? join(homedir(), 'AppData', 'Roaming') : '')
		const candidates: Array<{ execPath: string; isNodeJs: boolean }> = [
			{ execPath: join(appData, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'), isNodeJs: true },
			{ execPath: join(homedir(), '.npm-global', 'lib', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'), isNodeJs: true },
			{ execPath: '/usr/local/lib/node_modules/@openai/codex/bin/codex.js', isNodeJs: true },
			{ execPath: join(appData, 'npm', 'codex.cmd'), isNodeJs: false },
			{ execPath: join(homedir(), '.npm-global', 'bin', 'codex'), isNodeJs: false },
			{ execPath: '/usr/local/bin/codex', isNodeJs: false },
			{ execPath: join(homedir(), '.local', 'bin', 'codex'), isNodeJs: false },
		]

		for (const candidate of candidates) {
			if (candidate.execPath && existsSync(candidate.execPath)) {
				this.resolvedExec = candidate
				return this.resolvedExec
			}
		}

		this.resolvedExec = { execPath: 'codex', isNodeJs: false }
		return this.resolvedExec
	}

	private spawnCodex(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) {
		const exec = this.findExecutable()
		if (exec?.isNodeJs) {
			return spawn(process.execPath, [exec.execPath, ...args], {
				cwd: options.cwd,
				env: { ...process.env, ...options.env, CI: 'true', FORCE_COLOR: '0' },
				stdio: ['pipe', 'pipe', 'pipe'],
				windowsHide: true,
			})
		}

		return spawn(exec?.execPath || 'codex', args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env, CI: 'true', FORCE_COLOR: '0' },
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
			shell: process.platform === 'win32',
		})
	}

	async getStatus(refresh = false): Promise<ProviderStatusInfo> {
		const now = Date.now()
		if (!refresh && this.cachedStatus && now - this.lastStatusCheck < 15000) {
			return this.cachedStatus
		}

		const models = await this.getModels(refresh)

		return new Promise((resolveStatus) => {
			let isResolved = false
			const finish = (result: Partial<ProviderStatusInfo>) => {
				if (isResolved) return
				isResolved = true
				const info: ProviderStatusInfo = {
					id: this.id,
					name: this.displayName,
					status: result.status ?? 'not_installed',
					available: result.available ?? false,
					authenticated: result.authenticated ?? false,
					version: result.version,
					message: result.message,
					models,
				}
				this.cachedStatus = info
				this.lastStatusCheck = Date.now()
				resolveStatus(info)
			}

			const timeout = setTimeout(() => {
				finish({
					status: 'error',
					available: false,
					authenticated: false,
					message: 'Codex login status check timed out',
				})
			}, 5000)

			try {
				const child = this.spawnCodex(['login', 'status'], {})
				let stdout = ''
				let stderr = ''

				child.stdout.on('data', (d: Buffer) => {
					stdout += d.toString()
				})
				child.stderr.on('data', (d: Buffer) => {
					stderr += d.toString()
				})

				child.on('error', (err) => {
					clearTimeout(timeout)
					finish({
						status: 'not_installed',
						available: false,
						authenticated: false,
						message: err.message || 'Codex executable not found',
					})
				})

				child.on('close', async (code) => {
					clearTimeout(timeout)
					const text = (stdout + '\n' + stderr).trim()
					const isLoggedIn = code === 0 && (text.includes('Logged in') || text.includes('ChatGPT'))

					// Also query version
					const version = await this.getVersion()

					if (isLoggedIn) {
						finish({
							status: 'ready',
							available: true,
							authenticated: true,
							version,
							message: text || 'Logged in using ChatGPT',
						})
					} else {
						finish({
							status: 'not_authenticated',
							available: true,
							authenticated: false,
							version,
							message: text || 'Not logged in. Run `codex login` to sign in with your ChatGPT account.',
						})
					}
				})
			} catch (err) {
				clearTimeout(timeout)
				finish({
					status: 'not_installed',
					available: false,
					authenticated: false,
					message: err instanceof Error ? err.message : 'Failed to check Codex CLI',
				})
			}
		})
	}

	private async getVersion(): Promise<string | undefined> {
		return new Promise((resolveVersion) => {
			try {
				const child = this.spawnCodex(['--version'], {})
				let stdout = ''
				child.stdout.on('data', (d: Buffer) => {
					stdout += d.toString()
				})
				child.on('close', () => {
					const clean = stdout.trim()
					resolveVersion(clean || undefined)
				})
				child.on('error', () => resolveVersion(undefined))
			} catch {
				resolveVersion(undefined)
			}
		})
	}

	private knownModelIds = new Set<string>([
		'gpt-5.6-sol',
		'gpt-5.6-terra',
		'gpt-5.6-luna',
		'gpt-5.5',
		'gpt-5.4',
		'gpt-5.4-mini',
	])
	private cachedModels: AgentModelDefinition[] | null = null
	private cacheTimestamp = 0

	async getModels(refresh = false): Promise<AgentModelDefinition[]> {
		const now = Date.now()
		if (!refresh && this.cachedModels && this.cachedModels.length > 0 && now - this.cacheTimestamp < 60000) {
			return this.cachedModels
		}

		let configuredModel = 'gpt-5.6-sol'
		try {
			const configPath = join(homedir(), '.codex', 'config.toml')
			const content = await readFile(configPath, 'utf8')
			const match = content.match(/^model\s*=\s*["']([^"']+)["']/m)
			if (match && match[1]) {
				configuredModel = match[1]
			}
		} catch {
			// ignore
		}

		let rawModelsList: Array<{
			slug: string
			display_name?: string
			description?: string
			priority?: number
			visibility?: string
			default_reasoning_level?: string
			supported_reasoning_levels?: Array<{ effort: string; description?: string }>
		}> | null = null

		// 1. Try discovering models from CLI `codex debug models`
		try {
			rawModelsList = await this.fetchModelsFromCli()
		} catch {
			// fallback to next strategy
		}

		// 2. Try reading from ~/.codex/models_cache.json if CLI discovery failed
		if (!rawModelsList || rawModelsList.length === 0) {
			try {
				const cachePath = join(homedir(), '.codex', 'models_cache.json')
				if (existsSync(cachePath)) {
					const rawContent = await readFile(cachePath, 'utf8')
					const parsed = JSON.parse(rawContent) as { models?: typeof rawModelsList }
					if (Array.isArray(parsed.models) && parsed.models.length > 0) {
						rawModelsList = parsed.models
					}
				}
			} catch {
				// ignore
			}
		}

		// 3. Fallback to official Codex 0.149.0 models catalog if all else fails
		if (!rawModelsList || rawModelsList.length === 0) {
			rawModelsList = [
				{
					slug: 'gpt-5.6-sol',
					display_name: 'GPT-5.6-Sol',
					description: 'Latest frontier agentic coding model.',
					priority: 1,
					visibility: 'list',
					default_reasoning_level: 'low',
					supported_reasoning_levels: [
						{ effort: 'low', description: 'Fast responses with lighter reasoning' },
						{ effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
						{ effort: 'high', description: 'Greater reasoning depth for complex problems' },
						{ effort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
					],
				},
				{
					slug: 'gpt-5.6-terra',
					display_name: 'GPT-5.6-Terra',
					description: 'Balanced agentic coding model for everyday work.',
					priority: 2,
					visibility: 'list',
					default_reasoning_level: 'medium',
					supported_reasoning_levels: [
						{ effort: 'low', description: 'Fast responses with lighter reasoning' },
						{ effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
						{ effort: 'high', description: 'Greater reasoning depth for complex problems' },
						{ effort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
					],
				},
				{
					slug: 'gpt-5.6-luna',
					display_name: 'GPT-5.6-Luna',
					description: 'Fast and affordable agentic coding model.',
					priority: 3,
					visibility: 'list',
					default_reasoning_level: 'medium',
					supported_reasoning_levels: [
						{ effort: 'low', description: 'Fast responses with lighter reasoning' },
						{ effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
						{ effort: 'high', description: 'Greater reasoning depth for complex problems' },
						{ effort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
					],
				},
				{
					slug: 'gpt-5.5',
					display_name: 'GPT-5.5',
					description: 'Frontier model for complex coding, research, and real-world work.',
					priority: 7,
					visibility: 'list',
					default_reasoning_level: 'medium',
					supported_reasoning_levels: [
						{ effort: 'low', description: 'Fast responses with lighter reasoning' },
						{ effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
						{ effort: 'high', description: 'Greater reasoning depth for complex problems' },
						{ effort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
					],
				},
				{
					slug: 'gpt-5.4',
					display_name: 'GPT-5.4',
					description: 'Strong model for everyday coding.',
					priority: 16,
					visibility: 'list',
					default_reasoning_level: 'medium',
					supported_reasoning_levels: [
						{ effort: 'low', description: 'Fast responses with lighter reasoning' },
						{ effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
						{ effort: 'high', description: 'Greater reasoning depth for complex problems' },
						{ effort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
					],
				},
				{
					slug: 'gpt-5.4-mini',
					display_name: 'GPT-5.4-Mini',
					description: 'Small, fast, and cost-efficient model for simpler coding tasks.',
					priority: 23,
					visibility: 'list',
					default_reasoning_level: 'medium',
					supported_reasoning_levels: [
						{ effort: 'low', description: 'Fast responses with lighter reasoning' },
						{ effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
						{ effort: 'high', description: 'Greater reasoning depth for complex problems' },
						{ effort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
					],
				},
			]
		}

		// Filter visible models + ensure configured model is present
		const visibleModels = rawModelsList.filter(
			(m) => m.visibility !== 'hide' || m.slug === configuredModel,
		)
		visibleModels.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))

		const effortLabelMap: Record<string, string> = {
			low: 'Light',
			medium: 'Medium',
			high: 'High',
			xhigh: 'Extra High',
			ultra: 'Ultra',
			max: 'Max',
		}

		const speedTiers = [
			{ tier: 'default', label: 'Standard', description: 'Default speed' },
			{ tier: 'fast', label: 'Fast', description: '1.5x speed, more usage' },
		]

		const definitions: AgentModelDefinition[] = visibleModels.map((m) => {
			this.knownModelIds.add(m.slug)
			const cleanName = formatCodexModelDisplayName(m.slug, m.display_name)
			const supportedReasoning = (m.supported_reasoning_levels || []).map((lvl) => ({
				effort: lvl.effort,
				label: effortLabelMap[lvl.effort] || capitalize(lvl.effort),
				description: lvl.description,
			}))

			return {
				id: m.slug,
				name: cleanName,
				providerId: 'codex' as const,
				providerName: 'OpenAI Codex',
				description: m.description,
				isDefault: m.slug === configuredModel,
				supportedReasoningEfforts: supportedReasoning.length > 0 ? supportedReasoning : undefined,
				defaultReasoningEffort: m.default_reasoning_level || 'medium',
				supportedSpeedTiers: speedTiers,
				defaultSpeedTier: 'default',
			}
		})

		this.cachedModels = definitions
		this.cacheTimestamp = Date.now()
		return definitions
	}

	private async fetchModelsFromCli(): Promise<Array<{
		slug: string
		display_name?: string
		description?: string
		priority?: number
		visibility?: string
		default_reasoning_level?: string
		supported_reasoning_levels?: Array<{ effort: string; description?: string }>
	}>> {
		return new Promise((resolve, reject) => {
			try {
				const child = this.spawnCodex(['debug', 'models'], {})
				let stdout = ''
				let stderr = ''

				const timeout = setTimeout(() => {
					child.kill()
					reject(new Error('codex debug models timed out'))
				}, 6000)

				child.stdout.on('data', (d: Buffer) => {
					stdout += d.toString()
				})
				child.stderr.on('data', (d: Buffer) => {
					stderr += d.toString()
				})

				child.on('close', (code) => {
					clearTimeout(timeout)
					if (code === 0 && stdout.trim()) {
						try {
							let raw = stdout.trim()
							if (raw.charCodeAt(0) === 0xfeff) {
								raw = raw.slice(1)
							}
							const parsed = JSON.parse(raw) as {
								models?: Array<{
									slug: string
									display_name?: string
									description?: string
									priority?: number
									visibility?: string
									default_reasoning_level?: string
									supported_reasoning_levels?: Array<{ effort: string; description?: string }>
								}>
							}
							if (Array.isArray(parsed.models) && parsed.models.length > 0) {
								resolve(parsed.models)
								return
							}
						} catch (err) {
							reject(err)
							return
						}
					}
					reject(new Error(stderr || `codex debug models exited with code ${code}`))
				})

				child.on('error', (err) => {
					clearTimeout(timeout)
					reject(err)
				})
			} catch (err) {
				reject(err)
			}
		})
	}

	ownsModel(modelId: string): boolean {
		const clean = modelId.replace(/^(codex|openai):/, '')
		if (
			modelId.startsWith('codex:') ||
			modelId.startsWith('openai:') ||
			modelId.startsWith('gpt-') ||
			modelId.startsWith('o1') ||
			modelId.startsWith('o3') ||
			modelId.startsWith('o4') ||
			this.knownModelIds.has(clean) ||
			this.knownModelIds.has(modelId)
		) {
			return true
		}
		return false
	}

	async runTurn(
		projectPath: string,
		projectId: string,
		content: string,
		mode: AgentMode,
		model: string | undefined,
		context: SessionTurnContext,
		onEvent: (event: StreamEvent) => void,
	): Promise<TurnExecutionResult> {
		const resolvedProjectPath = resolve(projectPath)
		const threadId = !context.isProviderSwitch ? (context.codexThreadId ?? null) : null

		const args = buildCodexExecArgs({
			threadId,
			model,
			reasoningEffort: context.reasoningEffort,
			speed: context.speed,
			mode,
			autoApprove: this.config?.autoApproveTools,
		})

		// Build prompt with mode instructions and handoff context when resuming Dev Studio history
		let fullPrompt = `${CODEX_MODE_PROMPT_PREFIX[mode]}`
		if (context.recentMessagesSummary) {
			if (context.isProviderSwitch) {
				fullPrompt += `[Previous Conversation Context from ${context.previousProvider || 'previous agent'}:\n${context.recentMessagesSummary}]\n\n`
			} else if (context.isCodexThreadReset) {
				fullPrompt += `[Previous Conversation Context (continuing this Dev Studio session — Codex thread was restarted):\n${context.recentMessagesSummary}]\n\n`
			}
		}
		fullPrompt += content

		const child = this.spawnCodex(args, {
			cwd: resolvedProjectPath,
		})

		const activeProcess: ActiveProcess = { child }
		this.activeProcesses.set(projectId, activeProcess)

		child.stdin.write(fullPrompt)
		child.stdin.end()

		return this.consumeCodexStream(child, activeProcess, projectId, mode, onEvent)
	}

	private consumeCodexStream(
		child: ChildProcessWithoutNullStreams,
		activeProcess: ActiveProcess,
		projectId: string,
		mode: AgentMode,
		onEvent: (event: StreamEvent) => void,
	): Promise<TurnExecutionResult> {
		return new Promise((resolveResult) => {
			let capturedThreadId: string | undefined
			let agentContent = ''
			let failed = false
			const startedAt = Date.now()
			const activities: AgentActivityItem[] = []
			let tokenUsage: TokenUsage | undefined

			const timeline: ActivityTimelineItem = {
				id: `timeline-${Date.now()}`,
				kind: 'activity_timeline',
				status: 'running',
				startedAt,
				activities,
				entries: [],
				timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			}

			let buffer = ''
			let stderrLog = ''
			let errorEmitted = false

			const emitError = (message: string) => {
				const trimmed = message.trim()
				if (!trimmed || errorEmitted) return
				errorEmitted = true
				failed = true
				onEvent({ type: 'error', message: trimmed.slice(0, 500) })
			}

			const emitCommentary = (text: string) => {
				const trimmed = text.trim()
				if (!trimmed) return
				appendTimelineCommentary(timeline, trimmed)
				onEvent({ type: 'commentary_delta', content: trimmed })
			}

			const emitAgentMessage = (text: string) => {
				const trimmed = text.trim()
				if (!trimmed) return
				agentContent += (agentContent ? '\n\n' : '') + trimmed
				onEvent({ type: 'message_delta', content: trimmed })
				emitCommentary(trimmed)
			}

			const hasTurnOutput = () =>
				Boolean(agentContent.trim()) ||
				activities.length > 0 ||
				Boolean(timeline.entries?.length)

			const processLine = (line: string) => {
				const trimmed = line.trim()
				if (!trimmed) return

				try {
					const event = JSON.parse(trimmed) as {
						type: string
						thread_id?: string
						item?: CodexStreamItem
						usage?: {
							input_tokens?: number
							cached_input_tokens?: number
							output_tokens?: number
							reasoning_output_tokens?: number
						}
						error?: {
							message?: string
						}
						message?: string
					}

					const rawRateLimits = (event as { rate_limits?: CodexRateLimitsPayload; payload?: { rate_limits?: CodexRateLimitsPayload } }).rate_limits ||
						(event as { rate_limits?: CodexRateLimitsPayload; payload?: { rate_limits?: CodexRateLimitsPayload } }).payload?.rate_limits
					if (rawRateLimits) {
						setLatestCodexRateLimits(rawRateLimits)
					}

					if (event.type === 'thread.started' && event.thread_id) {
						capturedThreadId = event.thread_id
					}

					if (event.type === 'turn.started') {
						onEvent({ type: 'turn_status', status: 'running', label: 'Thinking…' })
					}

					if (event.type === 'item.started' && event.item) {
						const act = createRunningActivityFromCodexItem(event.item, mode)
						if (act) {
							appendTimelineActivity(timeline, act)
							onEvent({ type: 'activity_start', activity: act })
							onEvent({
								type: 'turn_status',
								status: 'running',
								label: act.title,
								tool: { name: act.toolName || act.type, label: act.title },
							})
						}
					}

					if (event.type === 'item.completed' && event.item) {
						const item = event.item
						const itemType = item.type || ''

						if (isCodexToolActivityItemType(itemType)) {
							const existing = activities.find((a) => a.id === item.id)
							const act = finalizeActivityFromCodexItem(existing, item, mode)
							if (act) {
								if (existing) {
									updateTimelineActivity(timeline, act)
								} else {
									appendTimelineActivity(timeline, act)
								}
								onEvent({ type: 'activity_complete', activity: act })
							}
							onEvent({ type: 'turn_status', status: 'running', label: 'Thinking…' })
						} else if (itemType === 'agent_message' && item.text) {
							emitAgentMessage(item.text)
						} else if (itemType === 'plan_update' && item.text) {
							emitCommentary(item.text)
						} else if (isCodexCommentaryItemType(itemType) && item.text) {
							emitCommentary(item.text)
						}
					}

					if (event.type === 'turn.completed') {
						if (event.usage) {
							tokenUsage = {
								inputTokens: event.usage.input_tokens,
								outputTokens: event.usage.output_tokens,
								cacheReadTokens: event.usage.cached_input_tokens,
								thinkingTokens: event.usage.reasoning_output_tokens,
							}
							timeline.usage = tokenUsage
						}
						onEvent({
							type: 'turn_status',
							status: 'complete',
							label: 'Complete',
							usage: tokenUsage,
						})
					}

					if (event.type === 'turn.failed' || event.type === 'error') {
						failed = true
						const msg = event.error?.message || event.message || 'Turn failed'
						onEvent({ type: 'error', message: msg })
					}
				} catch {
					// Non-JSON output line
				}
			}

			child.stdout.on('data', (chunk: Buffer) => {
				buffer += chunk.toString()
				const lines = buffer.split('\n')
				buffer = lines.pop() ?? ''
				for (const line of lines) {
					processLine(line)
				}
			})

			child.stderr.on('data', (chunk: Buffer) => {
				const text = chunk.toString()
				stderrLog += text
				const line = text.trim()
				if (!line) return
				if (
					/unknown option|unrecognized option|invalid value|not logged in|authentication required|panic:|fatal error/i.test(
						line,
					)
				) {
					emitError(line)
				}
			})

			child.on('close', (code) => {
				this.activeProcesses.delete(projectId)
				if (buffer.trim()) {
					processLine(buffer)
				}

				if (code !== 0 && !hasTurnOutput() && !activeProcess.stopped) {
					failed = true
					if (!errorEmitted && stderrLog.trim()) {
						const errLine =
							stderrLog
								.split('\n')
								.map((l) => l.trim())
								.find((l) => l && /error|failed|invalid|unknown|not logged in/i.test(l)) ||
							stderrLog.trim()
						emitError(errLine)
					}
				}

				timeline.status = failed ? 'error' : 'complete'
				timeline.completedAt = Date.now()
				timeline.durationMs = timeline.completedAt - timeline.startedAt

				resolveResult({
					agentContent,
					codexThreadId: capturedThreadId,
					failed,
					timeline,
				})
			})

			child.on('error', (err) => {
				this.activeProcesses.delete(projectId)
				failed = true
				onEvent({ type: 'error', message: err.message })
				resolveResult({
					agentContent,
					codexThreadId: capturedThreadId,
					failed: true,
					timeline,
				})
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

	resetSession(projectId: string): void {
		const active = this.activeProcesses.get(projectId)
		if (active) {
			active.child.kill()
			this.activeProcesses.delete(projectId)
		}
	}
}

function formatCodexModelDisplayName(slug: string, rawDisplayName?: string): string {
	if (rawDisplayName) {
		const clean = rawDisplayName.replace(/^GPT-?/i, '').replace(/-/g, ' ').trim()
		if (clean) return clean
	}
	const cleanSlug = slug.replace(/^gpt-?/i, '').replace(/-/g, ' ').trim()
	return cleanSlug
		.split(' ')
		.map((part) => capitalize(part))
		.join(' ')
}

function capitalize(str: string): string {
	if (!str) return ''
	return str.charAt(0).toUpperCase() + str.slice(1)
}

