export type Project = {
	id: string
	name: string
	path: string
	repositoryLabel?: string
	lastActivity: string
	isGitRepo: boolean
	hasRemote: boolean
	defaultBranch?: string
}

export type AppRoute = 'projects' | 'workspace' | 'settings'

export type WorkspaceView = 'agent' | 'changes' | 'files' | 'repo'

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
