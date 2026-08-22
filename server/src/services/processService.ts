import { exec, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { normalize } from 'node:path'
import type { ServerConfig } from '../config.js'
import type {
	DevProcess,
	NetworkPortInfo,
	ProcessActionResponse,
	ProcessCategory,
	ProcessListResponse,
	StartProcessRequest,
} from '../types/process.js'
import type { TerminalSessionManager } from './terminalService.js'

const execAsync = promisify(exec)

type ManagedProcess = {
	id: string
	pid: number
	projectId: string
	command: string
	args: string[]
	cwd: string
	title: string
	startedAt: string
	category: ProcessCategory
}

const DEV_KEYWORDS = [
	'vite',
	'node',
	'npm',
	'pnpm',
	'yarn',
	'npx',
	'tsx',
	'next',
	'webpack',
	'rollup',
	'esbuild',
	'tsc',
	'python',
	'pytest',
	'uvicorn',
	'flask',
	'django',
	'godot',
	'cargo',
	'vitest',
	'jest',
	'oxlint',
	'eslint',
]

export class ProcessService {
	private managed = new Map<number, ManagedProcess>()

	constructor(
		private config: ServerConfig,
		private terminalService?: TerminalSessionManager,
	) {}

	private async getListeningPorts(): Promise<Map<number, NetworkPortInfo[]>> {
		const portMap = new Map<number, NetworkPortInfo[]>()

		try {
			if (process.platform === 'win32') {
				const { stdout } = await execAsync('netstat -ano -p tcp', { timeout: 5000 })
				const lines = stdout.split('\n')
				for (const line of lines) {
					const trimmed = line.trim()
					if (!trimmed.startsWith('TCP')) continue
					const parts = trimmed.split(/\s+/)
					if (parts.length >= 5 && parts[3] === 'LISTENING') {
						const localAddr = parts[1]
						const pidStr = parts[4]
						const pid = parseInt(pidStr, 10)
						if (isNaN(pid)) continue

						const lastColon = localAddr.lastIndexOf(':')
						if (lastColon === -1) continue
						const port = parseInt(localAddr.slice(lastColon + 1), 10)
						const host = localAddr.slice(0, lastColon)

						if (!isNaN(port)) {
							const url =
								host === '0.0.0.0' || host === '127.0.0.1' || host === '::' || host === '[::]'
									? `http://localhost:${port}`
									: `http://${host}:${port}`

							const existing = portMap.get(pid) || []
							if (!existing.some((p) => p.port === port)) {
								existing.push({
									port,
									protocol: 'tcp',
									localAddress: localAddr,
									url,
								})
								portMap.set(pid, existing)
							}
						}
					}
				}
			} else {
				// POSIX fallback (lsof / ss)
				try {
					const { stdout } = await execAsync('ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null', {
						timeout: 5000,
					})
					const lines = stdout.split('\n')
					for (const line of lines) {
						const match = line.match(/:(\d+)\s+.*pid=(\d+)/i)
						if (match) {
							const port = parseInt(match[1], 10)
							const pid = parseInt(match[2], 10)
							if (!isNaN(port) && !isNaN(pid)) {
								const existing = portMap.get(pid) || []
								if (!existing.some((p) => p.port === port)) {
									existing.push({
										port,
										protocol: 'tcp',
										localAddress: `127.0.0.1:${port}`,
										url: `http://localhost:${port}`,
									})
									portMap.set(pid, existing)
								}
							}
						}
					}
				} catch {
					// ignore
				}
			}
		} catch {
			// ignore netstat errors
		}

		return portMap
	}

	private parseDate(val: unknown): string | undefined {
		if (typeof val === 'string') {
			const match = val.match(/\/Date\((\d+)\)\//)
			if (match) {
				return new Date(parseInt(match[1], 10)).toISOString()
			}
			const parsed = new Date(val)
			if (!isNaN(parsed.getTime())) {
				return parsed.toISOString()
			}
		} else if (typeof val === 'number') {
			return new Date(val).toISOString()
		}
		return undefined
	}

	async listProcesses(
		projectId: string,
		projectPath: string,
		showAll = false,
	): Promise<ProcessListResponse> {
		const normProjectPath = normalize(projectPath).toLowerCase()
		const portsByPid = await this.getListeningPorts()
		const backendPid = process.pid
		const rawProcesses: DevProcess[] = []

		// Get terminal sessions for this project to link PIDs
		const terminalSessions = this.terminalService ? this.terminalService.listSessions(projectId) : []
		const terminalPidMap = new Map<number, string>()
		if (this.terminalService) {
			for (const term of terminalSessions) {
				const session = this.terminalService.getSession(term.id)
				if (session && session.pty.pid) {
					terminalPidMap.set(session.pty.pid, term.id)
				}
			}
		}

		if (process.platform === 'win32') {
			try {
				const psCmd =
					'powershell -NoProfile -NonInteractive -Command "' +
					'Get-CimInstance Win32_Process | ' +
					'Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath, CreationDate, WorkingSetSize | ' +
					'ConvertTo-Json -Compress"'

				const { stdout } = await execAsync(psCmd, { maxBuffer: 10 * 1024 * 1024, timeout: 10000 })
				if (stdout && stdout.trim()) {
					const parsed = JSON.parse(stdout)
					const list = Array.isArray(parsed) ? parsed : [parsed]

					for (const item of list) {
						const pid = item.ProcessId as number
						if (!pid || pid === 0) continue

						const parentPid = item.ParentProcessId as number | undefined
						const name = (item.Name as string) || 'unknown'
						const commandLine = (item.CommandLine as string) || (item.ExecutablePath as string) || name
						const commandLower = commandLine.toLowerCase()
						const startedAt = this.parseDate(item.CreationDate)
						const memoryBytes = item.WorkingSetSize as number | undefined
						const ports = portsByPid.get(pid) || []

						// Check if child of a listening process or parent has ports
						if (ports.length === 0 && parentPid && portsByPid.has(parentPid)) {
							const parentPorts = portsByPid.get(parentPid) || []
							ports.push(...parentPorts)
						}

						const isDevStudioBackend = pid === backendPid
						const terminalSessionId = terminalPidMap.get(pid) || (parentPid ? terminalPidMap.get(parentPid) : undefined)
						const isManaged = this.managed.has(pid)
						const managedInfo = this.managed.get(pid)

						// Determine if process belongs to current project
						const containsPath =
							commandLower.includes(normProjectPath) ||
							(managedInfo?.cwd && normalize(managedInfo.cwd).toLowerCase().includes(normProjectPath))
						const isTerminalForProject = Boolean(terminalSessionId)
						const isDevServerOrPort = ports.length > 0
						const matchesKeyword = DEV_KEYWORDS.some((kw) => name.toLowerCase().includes(kw) || commandLower.includes(kw))

						const isProjectProcess = isDevStudioBackend || isManaged || isTerminalForProject || containsPath || (isDevServerOrPort && matchesKeyword)

						let category: ProcessCategory = 'other'
						if (isDevStudioBackend) {
							category = 'system'
						} else if (isTerminalForProject || name.toLowerCase().includes('powershell') || name.toLowerCase().includes('bash') || name.toLowerCase().includes('cmd.exe')) {
							category = 'terminal'
						} else if (
							ports.length > 0 ||
							commandLower.includes('vite') ||
							commandLower.includes('serve') ||
							commandLower.includes('start') ||
							commandLower.includes('dev') ||
							commandLower.includes('next') ||
							commandLower.includes('uvicorn')
						) {
							category = 'dev-server'
						} else if (
							commandLower.includes('watch') ||
							commandLower.includes('tsc') ||
							commandLower.includes('tailwind')
						) {
							category = 'build-watcher'
						} else if (
							commandLower.includes('test') ||
							commandLower.includes('jest') ||
							commandLower.includes('vitest') ||
							commandLower.includes('pytest')
						) {
							category = 'test-runner'
						}

						let uptimeSeconds: number | undefined
						if (startedAt) {
							const diff = (Date.now() - new Date(startedAt).getTime()) / 1000
							uptimeSeconds = diff > 0 ? Math.floor(diff) : undefined
						}

						const detectedUrl = ports[0]?.url

						let source: 'dev-studio' | 'terminal' | 'discovered' = 'discovered'
						if (isManaged || isDevStudioBackend) source = 'dev-studio'
						else if (isTerminalForProject) source = 'terminal'

						rawProcesses.push({
							pid,
							parentPid,
							name: isDevStudioBackend ? 'Dev Studio Backend' : name,
							command: commandLine,
							cwd: managedInfo?.cwd || (containsPath ? projectPath : undefined),
							startedAt,
							uptimeSeconds,
							status: ports.length > 0 ? 'listening' : 'running',
							memoryBytes,
							ports,
							detectedUrl,
							source,
							terminalSessionId,
							isDevStudioBackend,
							category,
							isProjectProcess,
						})
					}
				}
			} catch (err) {
				console.error('Failed to list processes via PowerShell:', err)
			}
		} else {
			// POSIX / Linux fallback
			try {
				const { stdout } = await execAsync('ps -eo pid,ppid,comm,args', { timeout: 5000 })
				const lines = stdout.split('\n').slice(1)
				for (const line of lines) {
					const trimmed = line.trim()
					if (!trimmed) continue
					const parts = trimmed.split(/\s+/)
					if (parts.length >= 4) {
						const pid = parseInt(parts[0], 10)
						const parentPid = parseInt(parts[1], 10)
						const name = parts[2]
						const commandLine = parts.slice(3).join(' ')
						if (isNaN(pid) || pid === 0) continue

						const ports = portsByPid.get(pid) || []
						const isDevStudioBackend = pid === backendPid
						const terminalSessionId = terminalPidMap.get(pid) || (parentPid ? terminalPidMap.get(parentPid) : undefined)
						const isManaged = this.managed.has(pid)
						const managedInfo = this.managed.get(pid)
						const containsPath = commandLine.toLowerCase().includes(normProjectPath)
						const matchesKeyword = DEV_KEYWORDS.some((kw) => name.toLowerCase().includes(kw) || commandLine.toLowerCase().includes(kw))
						const isProjectProcess = isDevStudioBackend || isManaged || Boolean(terminalSessionId) || containsPath || (ports.length > 0 && matchesKeyword)

						rawProcesses.push({
							pid,
							parentPid,
							name: isDevStudioBackend ? 'Dev Studio Backend' : name,
							command: commandLine,
							cwd: managedInfo?.cwd || (containsPath ? projectPath : undefined),
							status: ports.length > 0 ? 'listening' : 'running',
							ports,
							detectedUrl: ports[0]?.url,
							source: isManaged || isDevStudioBackend ? 'dev-studio' : terminalSessionId ? 'terminal' : 'discovered',
							terminalSessionId,
							isDevStudioBackend,
							category: isDevStudioBackend ? 'system' : ports.length > 0 ? 'dev-server' : 'other',
							isProjectProcess,
						})
					}
				}
			} catch (err) {
				console.error('Failed to list processes via ps:', err)
			}
		}

		// Ensure backend process is always in list even if inspection failed
		if (!rawProcesses.some((p) => p.isDevStudioBackend)) {
			const ports = portsByPid.get(backendPid) || [
				{
					port: this.config.port,
					protocol: 'tcp',
					localAddress: `0.0.0.0:${this.config.port}`,
					url: `http://localhost:${this.config.port}`,
				},
			]
			rawProcesses.push({
				pid: backendPid,
				name: 'Dev Studio Backend',
				command: `node dist/index.js (Port ${this.config.port})`,
				cwd: projectPath,
				status: 'listening',
				ports,
				detectedUrl: `http://localhost:${this.config.port}`,
				source: 'dev-studio',
				isDevStudioBackend: true,
				category: 'system',
				isProjectProcess: true,
				startedAt: new Date().toISOString(),
			})
		}

		// Filter
		const filtered = showAll ? rawProcesses : rawProcesses.filter((p) => p.isProjectProcess)

		// Sort: backend first, then listening dev servers, then managed/terminal, then PID
		filtered.sort((a, b) => {
			if (a.isDevStudioBackend) return -1
			if (b.isDevStudioBackend) return 1
			if (a.ports.length > 0 && b.ports.length === 0) return -1
			if (b.ports.length > 0 && a.ports.length === 0) return 1
			if (a.source === 'terminal' && b.source !== 'terminal') return -1
			if (b.source === 'terminal' && a.source !== 'terminal') return 1
			return a.name.localeCompare(b.name)
		})

		return {
			processes: filtered,
			projectPath,
			backendPid,
		}
	}

	async startProcess(
		projectId: string,
		projectPath: string,
		req: StartProcessRequest,
	): Promise<ProcessActionResponse> {
		const cmd = req.command.trim()
		if (!cmd) {
			return { success: false, message: 'Command is required' }
		}

		const cwd = req.cwd || projectPath
		const args = req.args || []
		const title = req.title || cmd

		// If terminal manager is available, start it in a persistent terminal session so it has interactive I/O
		if (this.terminalService) {
			const termSession = this.terminalService.createSession(projectId, projectPath, {
				title: `Server: ${title}`,
				cwd,
			})
			// Send command into the shell to run
			const fullCmd = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd
			this.terminalService.handleMessage(termSession.id, {
				type: 'input',
				data: `${fullCmd}\r\n`,
			})

			const activeSession = this.terminalService.getSession(termSession.id)
			const pid = activeSession?.pty.pid

			if (pid) {
				this.managed.set(pid, {
					id: termSession.id,
					pid,
					projectId,
					command: fullCmd,
					args,
					cwd,
					title,
					startedAt: new Date().toISOString(),
					category: 'dev-server',
				})
			}

			return {
				success: true,
				message: `Started "${title}" in Terminal`,
				pid,
			}
		}

		// Fallback: spawn background child
		const isWindows = process.platform === 'win32'
		const child = isWindows
			? spawn('cmd.exe', ['/c', cmd, ...args], { cwd, detached: true, stdio: 'ignore' })
			: spawn(cmd, args, { cwd, detached: true, stdio: 'ignore' })

		child.unref()

		if (child.pid) {
			this.managed.set(child.pid, {
				id: `proc_${Date.now()}`,
				pid: child.pid,
				projectId,
				command: cmd,
				args,
				cwd,
				title,
				startedAt: new Date().toISOString(),
				category: 'dev-server',
			})
			return { success: true, message: `Started "${title}" (PID: ${child.pid})`, pid: child.pid }
		}

		return { success: false, message: 'Failed to spawn process' }
	}

	async stopProcess(
		pid: number,
		options?: { force?: boolean; acknowledgeBackend?: boolean },
	): Promise<ProcessActionResponse> {
		if (pid === process.pid) {
			if (!options?.acknowledgeBackend) {
				return {
					success: false,
					message:
						'PROTECTED: Dev Studio Backend is protected. Stopping this process will disconnect Dev Studio and cannot currently be recovered remotely unless an external supervisor restarts it.',
				}
			}
			// If explicitly acknowledged, schedule graceful exit
			setTimeout(() => process.exit(0), 500)
			return { success: true, message: 'Dev Studio backend shutting down...', pid }
		}

		try {
			if (process.platform === 'win32') {
				const flag = options?.force ? '/F' : '/F' // Force tree kill on Windows ensures children terminate
				await execAsync(`taskkill /PID ${pid} /T ${flag}`, { timeout: 5000 })
			} else {
				process.kill(pid, options?.force ? 'SIGKILL' : 'SIGTERM')
			}
			this.managed.delete(pid)
			return { success: true, message: `Process ${pid} stopped`, pid }
		} catch (err) {
			return {
				success: false,
				message: err instanceof Error ? err.message : `Failed to stop process ${pid}`,
				pid,
			}
		}
	}

	async restartProcess(
		pid: number,
		projectId: string,
		projectPath: string,
	): Promise<ProcessActionResponse> {
		if (pid === process.pid) {
			return {
				success: false,
				message: 'Cannot restart Dev Studio backend remotely without a supervisor.',
			}
		}

		const managed = this.managed.get(pid)
		await this.stopProcess(pid, { force: true })

		if (managed) {
			await new Promise((r) => setTimeout(r, 1000))
			return this.startProcess(projectId, projectPath, {
				command: managed.command,
				args: managed.args,
				cwd: managed.cwd,
				title: managed.title,
			})
		}

		return { success: true, message: `Process ${pid} stopped. Re-launch from your script or terminal.` }
	}
}

