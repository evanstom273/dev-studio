import type {
	BranchRequest,
	CommitRequest,
	DiscardRequest,
	GitBranch,
	GitCommit,
	GitStatus,
	MergeRequest,
	PullRequest,
	PushRequest,
	RemoteRequest,
	RevertRequest,
	StageRequest,
} from '@shared/types/git'
import type { CloneRepoRequest, CreateAndOpenRepoRequest, InitRepoRequest, OpenGitHubRepoRequest, Project, RegisterProjectRequest } from '@shared/types/project'
import { apiFetch } from './apiClient'

export const gitApi = {
	status(projectId: string): Promise<GitStatus> {
		return apiFetch(`/api/git/${projectId}/status`)
	},

	log(projectId: string, limit = 30): Promise<GitCommit[]> {
		return apiFetch(`/api/git/${projectId}/log?limit=${limit}`)
	},

	branches(projectId: string): Promise<GitBranch[]> {
		return apiFetch(`/api/git/${projectId}/branches`)
	},

	stage(projectId: string, body: StageRequest): Promise<void> {
		return apiFetch(`/api/git/${projectId}/stage`, { method: 'POST', body: JSON.stringify(body) })
	},

	stageAll(projectId: string): Promise<void> {
		return apiFetch(`/api/git/${projectId}/stage-all`, { method: 'POST' })
	},

	unstage(projectId: string, body: StageRequest): Promise<void> {
		return apiFetch(`/api/git/${projectId}/unstage`, { method: 'POST', body: JSON.stringify(body) })
	},

	unstageAll(projectId: string): Promise<void> {
		return apiFetch(`/api/git/${projectId}/unstage-all`, { method: 'POST' })
	},

	commit(projectId: string, body: CommitRequest): Promise<{ hash: string }> {
		return apiFetch(`/api/git/${projectId}/commit`, { method: 'POST', body: JSON.stringify(body) })
	},

	fetch(projectId: string, remote = 'origin'): Promise<void> {
		return apiFetch(`/api/git/${projectId}/fetch`, { method: 'POST', body: JSON.stringify({ remote }) })
	},

	pull(projectId: string, body: PullRequest = {}): Promise<void> {
		return apiFetch(`/api/git/${projectId}/pull`, { method: 'POST', body: JSON.stringify(body) })
	},

	push(projectId: string, body: PushRequest = {}): Promise<void> {
		return apiFetch(`/api/git/${projectId}/push`, { method: 'POST', body: JSON.stringify(body) })
	},

	checkout(projectId: string, body: BranchRequest): Promise<void> {
		return apiFetch(`/api/git/${projectId}/checkout`, { method: 'POST', body: JSON.stringify(body) })
	},

	merge(projectId: string, body: MergeRequest): Promise<{ success: boolean }> {
		return apiFetch(`/api/git/${projectId}/merge`, { method: 'POST', body: JSON.stringify(body) })
	},

	discard(projectId: string, body: DiscardRequest): Promise<void> {
		return apiFetch(`/api/git/${projectId}/discard`, { method: 'POST', body: JSON.stringify(body) })
	},

	revert(projectId: string, body: RevertRequest): Promise<void> {
		return apiFetch(`/api/git/${projectId}/revert`, { method: 'POST', body: JSON.stringify(body) })
	},

	addRemote(projectId: string, body: RemoteRequest): Promise<void> {
		return apiFetch(`/api/git/${projectId}/remote`, { method: 'POST', body: JSON.stringify(body) })
	},
}

export const projectsApi = {
	list(): Promise<Project[]> {
		return apiFetch('/api/projects')
	},

	register(body: RegisterProjectRequest): Promise<Project> {
		return apiFetch('/api/projects/register', { method: 'POST', body: JSON.stringify(body) })
	},

	openLocal(body: RegisterProjectRequest): Promise<Project> {
		return apiFetch('/api/projects/open-local', { method: 'POST', body: JSON.stringify(body) })
	},

	init(body: InitRepoRequest): Promise<Project> {
		return apiFetch('/api/projects/init', { method: 'POST', body: JSON.stringify(body) })
	},

	clone(body: CloneRepoRequest): Promise<Project> {
		return apiFetch('/api/projects/clone', { method: 'POST', body: JSON.stringify(body) })
	},

	openFromGitHub(body: OpenGitHubRepoRequest): Promise<Project> {
		return apiFetch('/api/projects/open-github', { method: 'POST', body: JSON.stringify(body) })
	},

	createOnGitHub(body: CreateAndOpenRepoRequest): Promise<Project> {
		return apiFetch('/api/projects/create-github', { method: 'POST', body: JSON.stringify(body) })
	},

	removeLocalCopy(id: string): Promise<void> {
		return apiFetch(`/api/projects/${id}/remove-local`, { method: 'POST' })
	},

	unregister(id: string): Promise<void> {
		return apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
	},
}
