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

type ActiveProcess = {
	child: ChildProcessWithoutNullStreams
	stopped?: boolean
}

const CODEX_MODE_PROMPT_PREFIX: Record<AgentMode, string> = {
	agent:
		'[AGENT MODE] You are a coding agent working directly in Dev Studio. Inspect, edit, and test files in the project workspace as needed.\n\n',
	ask: '[ASK MODE] Answer questions and analyze code only. Do NOT edit files, run commands, or make changes.\n\n',
	plan: '[PLAN MODE] Create a detailed implementation plan for the task. Do NOT execute changes — only outline steps.\n\n',
}

export class CodexProvider implements AgentProvider {
	readonly id = 'codex' as const
	readonly displayName = 'OpenAI Codex'

	private activeProcesses = new Map<string, ActiveProcess>()
	private resolvedExec: { execPath: string; isNodeJs: boolean } | null = null

	async init(): Promise<void> {
		this.findExecutable()
	}

	private findExecutable(): { execPath: string; isNodeJs: boolean } | null {
		if (this.resolvedExec && existsSync(this.resolvedExec.execPath)) {
			return this.resolvedExec
		}

		// 1. Check npm global package codex.js (cross-platform, reliable node invocation)
		const appData = process.env.APPDATA || ''
		const winNpmJs = join(appData, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
		if (existsSync(winNpmJs)) {
			this.resolvedExec = { execPath: winNpmJs, isNodeJs: true }
			return this.resolvedExec
		}

		// Standard unix npm global locations
		const unixGlobalJs = join(homedir(), '.npm-global', 'lib', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
		if (existsSync(unixGlobalJs)) {
			this.resolvedExec = { execPath: unixGlobalJs, isNodeJs: true }
			return this.resolvedExec
		}

		const usrLocalJs = '/usr/local/lib/node_modules/@openai/codex/bin/codex.js'
		if (existsSync(usrLocalJs)) {
			this.resolvedExec = { execPath: usrLocalJs, isNodeJs: true }
			return this.resolvedExec
		}

		// 2. Check ~/.codex/config.toml for CODEX_CLI_PATH if configured
		try {
			const configPath = join(homedir(), '.codex', 'config.toml')
			if (existsSync(configPath)) {
				// We can check if CODEX_CLI_PATH is present
				// Will be resolved in getStatus if needed
			}
		} catch {
			// ignore
		}

		// 3. Fallback to 'codex' in PATH
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

	async getStatus(_refresh = false): Promise<ProviderStatusInfo> {
		const models = await this.getModels()

		return new Promise((resolveStatus) => {
			let isResolved = false
			const finish = (result: Partial<ProviderStatusInfo>) => {
				if (isResolved) return
				isResolved = true
				resolveStatus({
					id: this.id,
					name: this.displayName,
					status: result.status ?? 'not_installed',
					available: result.available ?? false,
					authenticated: result.authenticated ?? false,
					version: result.version,
					message: result.message,
					models,
				})
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

	async getModels(): Promise<AgentModelDefinition[]> {
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

		const knownModels = [
			{ id: 'gpt-5.6-sol', name: 'GPT-5.6 (Codex)' },
			{ id: 'gpt-4o', name: 'GPT-4o (Codex)' },
			{ id: 'o3-mini', name: 'o3-mini (Codex)' },
			{ id: 'o1', name: 'o1 (Codex)' },
			{ id: 'gpt-4.1', name: 'GPT-4.1 (Codex)' },
		]

		// Ensure configuredModel is present
		if (!knownModels.some((m) => m.id === configuredModel)) {
			knownModels.unshift({ id: configuredModel, name: `${configuredModel} (Codex)` })
		}

		return knownModels.map((m) => ({
			id: m.id,
			name: m.name,
			providerId: 'codex' as const,
			providerName: 'OpenAI Codex',
			isDefault: m.id === configuredModel,
		}))
	}

	ownsModel(modelId: string): boolean {
		if (
			modelId.startsWith('codex:') ||
			modelId.startsWith('openai:') ||
			modelId.startsWith('gpt-5') ||
			modelId === 'o3-mini' ||
			modelId === 'o1' ||
			modelId === 'gpt-4o' ||
			modelId === 'gpt-4.1'
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

		const args: string[] = []
		if (threadId) {
			args.push('exec', 'resume', threadId, '--json', '--skip-git-repo-check')
		} else {
			args.push('exec', '--json', '--skip-git-repo-check')
		}

		if (model) {
			// Strip prefix if any (e.g. codex:gpt-5.6-sol)
			const cleanModel = model.replace(/^(codex|openai):/, '')
			args.push('-m', cleanModel)
		}

		if (mode === 'ask' || mode === 'plan') {
			args.push('-s', 'read-only')
		}

		args.push('-') // read prompt from stdin

		// Build prompt with mode instructions and handoff context if switching
		let fullPrompt = `${CODEX_MODE_PROMPT_PREFIX[mode]}`
		if (context.isProviderSwitch && context.recentMessagesSummary) {
			fullPrompt += `[Previous Conversation Context from ${context.previousProvider || 'previous agent'}:\n${context.recentMessagesSummary}]\n\n`
		}
		fullPrompt += content

		const child = this.spawnCodex(args, {
			cwd: resolvedProjectPath,
		})

		const activeProcess: ActiveProcess = { child }
		this.activeProcesses.set(projectId, activeProcess)

		child.stdin.write(fullPrompt)
		child.stdin.end()

		return this.consumeCodexStream(child, activeProcess, projectId, onEvent)
	}

	private consumeCodexStream(
		child: ChildProcessWithoutNullStreams,
		activeProcess: ActiveProcess,
		projectId: string,
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
				timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			}

			let buffer = ''

			const processLine = (line: string) => {
				const trimmed = line.trim()
				if (!trimmed) return

				try {
					const event = JSON.parse(trimmed) as {
						type: string
						thread_id?: string
						item?: {
							id?: string
							type?: string
							text?: string
							command?: string
							aggregated_output?: string
							exit_code?: number | null
							status?: string
							message?: string
						}
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

					if (event.type === 'thread.started' && event.thread_id) {
						capturedThreadId = event.thread_id
					}

					if (event.type === 'turn.started') {
						onEvent({ type: 'turn_status', status: 'running', label: 'Thinking…' })
					}

					if (event.type === 'item.started' && event.item) {
						const item = event.item
						if (item.type === 'command_execution') {
							const act: AgentActivityItem = {
								id: item.id || `act-${Date.now()}`,
								type: 'command',
								status: 'running',
								title: item.command ? `$ ${item.command}` : 'Running command',
								detail: { command: item.command },
								startedAt: Date.now(),
								toolName: 'bash',
							}
							activities.push(act)
							onEvent({ type: 'activity_start', activity: act })
							onEvent({
								type: 'turn_status',
								status: 'running',
								label: item.command ? `$ ${item.command}` : 'Running command…',
								tool: { name: 'bash', label: item.command || 'command' },
							})
						}
					}

					if (event.type === 'item.completed' && event.item) {
						const item = event.item
						if (item.type === 'command_execution') {
							const existing = activities.find((a) => a.id === item.id)
							const isSuccess = item.exit_code === 0
							if (existing) {
								existing.status = isSuccess ? 'completed' : 'failed'
								existing.completedAt = Date.now()
								existing.durationMs = existing.completedAt - existing.startedAt
								existing.detail = {
									command: item.command,
									output: item.aggregated_output,
									exitCode: item.exit_code ?? undefined,
								}
								onEvent({ type: 'activity_complete', activity: existing })
							}
							onEvent({ type: 'turn_status', status: 'running', label: 'Thinking…' })
						} else if (item.type === 'agent_message' && item.text) {
							agentContent += (agentContent ? '\n' : '') + item.text
							onEvent({ type: 'message_delta', content: item.text })
						} else if (item.type === 'error' && item.message) {
							const act: AgentActivityItem = {
								id: item.id || `err-${Date.now()}`,
								type: 'error',
								status: 'failed',
								title: item.message,
								detail: { error: item.message },
								startedAt: Date.now(),
								completedAt: Date.now(),
								durationMs: 0,
							}
							activities.push(act)
							onEvent({ type: 'activity_complete', activity: act })
						}
					}

					if (event.type === 'turn.completed' && event.usage) {
						tokenUsage = {
							inputTokens: event.usage.input_tokens,
							outputTokens: event.usage.output_tokens,
							cacheReadTokens: event.usage.cached_input_tokens,
							thinkingTokens: event.usage.reasoning_output_tokens,
						}
						timeline.usage = tokenUsage
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
					// Non-JSON output line - ignore or log
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
				// Only emit as error if it's a real failure message
				if (text.includes('ERROR') && !text.includes('rmcp::transport')) {
					// keep internal logs from cluttering UI unless fatal
				}
			})

			child.on('close', (code) => {
				this.activeProcesses.delete(projectId)
				if (buffer.trim()) {
					processLine(buffer)
				}

				if (code !== 0 && !agentContent && !activeProcess.stopped) {
					failed = true
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

