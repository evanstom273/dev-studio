export type ProjectStorage = 'local' | 'github-cache'
export type WorkspaceSource = 'local' | 'managed'

export type Project = {
	id: string
	name: string
	path: string
	repositoryLabel?: string
	lastActivity: string
	isGitRepo: boolean
	hasRemote: boolean
	defaultBranch?: string
	storage?: ProjectStorage
	workspaceSource?: WorkspaceSource
	githubFullName?: string
	exists?: boolean
}

export type AppRoute = 'projects' | 'workspace' | 'settings'

export type WorkspaceView =
	| 'agent'
	| 'changes'
	| 'files'
	| 'repo'
	| 'status'
	| 'editor'
	| 'terminal'
	| 'artifacts'
	| 'processes'
	| 'problems'
	| 'plans'
	| 'browser'

export type ToolId =
	| 'editor'
	| 'terminal'
	| 'artifacts'
	| 'processes'
	| 'problems'
	| 'plans'
	| 'browser'

export type RepoTab = 'git' | 'github'

export type RegisterProjectRequest = {
	path: string
	name?: string
}

export type InitRepoRequest = {
	path: string
	name?: string
}

export type CloneRepoRequest = {
	url: string
	path?: string
	name?: string
}

export type OpenGitHubRepoRequest = {
	owner: string
	repo: string
}

export type CreateAndOpenRepoRequest = {
	name: string
	description?: string
	private?: boolean
}

export type BrowseDirectoryEntry = {
	name: string
	path: string
	isDirectory: boolean
}

export type BrowseDirectoryResult = {
	path: string
	parent: string | null
	entries: BrowseDirectoryEntry[]
	projectsRoot: string
	homeDir: string
}
