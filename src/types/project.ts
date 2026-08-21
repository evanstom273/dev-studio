export type Project = {
	id: string
	name: string
	repositoryLabel?: string
	lastActivity: string
}

export type WorkspaceView = 'agent' | 'changes' | 'files'

export type AppRoute = 'projects' | 'workspace'
