export type ProcessCategory =
	| 'dev-server'
	| 'build-watcher'
	| 'test-runner'
	| 'terminal'
	| 'system'
	| 'other'

export type NetworkPortInfo = {
	port: number
	protocol: 'tcp' | 'udp'
	localAddress: string
	url?: string
}

export type DevProcess = {
	pid: number
	parentPid?: number
	name: string
	command: string
	cwd?: string
	startedAt?: string
	uptimeSeconds?: number
	status: 'running' | 'listening' | 'stopped'
	cpuPercent?: number
	memoryBytes?: number
	ports: NetworkPortInfo[]
	detectedUrl?: string
	source: 'dev-studio' | 'terminal' | 'discovered'
	terminalSessionId?: string
	isDevStudioBackend?: boolean
	category: ProcessCategory
	isProjectProcess: boolean
}

export type ProcessListResponse = {
	processes: DevProcess[]
	projectPath: string
	backendPid: number
}

export type StartProcessRequest = {
	command: string
	args?: string[]
	cwd?: string
	title?: string
}

export type ProcessActionResponse = {
	success: boolean
	message?: string
	pid?: number
}

