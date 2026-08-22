export type ProblemSeverity = 'error' | 'warning' | 'info'

export type ProblemSource =
	| 'typescript'
	| 'compiler'
	| 'lint'
	| 'build'
	| 'test'
	| 'runtime'
	| 'terminal'
	| 'git'
	| 'github'
	| 'merge_conflict'
	| 'pull_request'
	| 'deployment'
	| 'agent'

export type Problem = {
	id: string
	projectId: string
	source: ProblemSource
	severity: ProblemSeverity
	category: string
	title: string
	message: string
	file?: string
	line?: number
	column?: number
	endLine?: number
	endColumn?: number
	command?: string
	gitBranch?: string
	pullRequestNumber?: number
	createdAt: string
	updatedAt: string
	resolved: boolean
	resolvedAt?: string
	metadata?: Record<string, unknown>
}

export type ProblemFilter = {
	status?: 'active' | 'resolved' | 'all'
	severity?: ProblemSeverity | 'all'
	source?: string | 'all'
	search?: string
}

export type ProblemSummary = {
	total: number
	errors: number
	warnings: number
	info: number
	active: number
	resolved: number
}

