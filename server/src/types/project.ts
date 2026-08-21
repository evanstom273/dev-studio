export type ProjectStorage = 'local' | 'github-cache'

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
	githubFullName?: string
}

export type AppRoute = 'projects' | 'workspace' | 'settings'

export type WorkspaceView = 'agent' | 'changes' | 'files' | 'repo' | 'status'

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
