import type {
	CreateGitHubRepoRequest,
	CreatePullRequestRequest,
	DeleteRepoRequest,
	GitHubAuthStatus,
	GitHubPullRequest,
	GitHubRepo,
	GitHubRepoInfo,
	MergePullRequestRequest,
	UpdateRepoRequest,
} from '@shared/types/github'
import { apiFetch } from './apiClient'

export const githubApi = {
	authStatus(): Promise<GitHubAuthStatus> {
		return apiFetch('/api/github/auth')
	},

	getRepo(projectId: string): Promise<GitHubRepoInfo | null> {
		return apiFetch(`/api/github/${projectId}/repo`)
	},

	createRepo(projectId: string, body: CreateGitHubRepoRequest): Promise<GitHubRepo> {
		return apiFetch(`/api/github/${projectId}/repo`, { method: 'POST', body: JSON.stringify(body) })
	},

	updateRepo(projectId: string, body: UpdateRepoRequest): Promise<void> {
		return apiFetch(`/api/github/${projectId}/repo`, { method: 'PATCH', body: JSON.stringify(body) })
	},

	deleteRepo(projectId: string, body: DeleteRepoRequest): Promise<void> {
		return apiFetch(`/api/github/${projectId}/repo`, { method: 'DELETE', body: JSON.stringify(body) })
	},

	listPullRequests(projectId: string): Promise<GitHubPullRequest[]> {
		return apiFetch(`/api/github/${projectId}/prs`)
	},

	createPullRequest(projectId: string, body: CreatePullRequestRequest): Promise<GitHubPullRequest> {
		return apiFetch(`/api/github/${projectId}/prs`, { method: 'POST', body: JSON.stringify(body) })
	},

	mergePullRequest(projectId: string, body: MergePullRequestRequest): Promise<void> {
		return apiFetch(`/api/github/${projectId}/prs/merge`, { method: 'POST', body: JSON.stringify(body) })
	},
}

export const permissionsApi = {
	list(projectId?: string) {
		const query = projectId ? `?projectId=${projectId}` : ''
		return apiFetch<Array<import('@shared/types/agent').PermissionRequest>>(`/api/agent/permissions${query}`)
	},

	approve(id: string) {
		return apiFetch(`/api/agent/permissions/${id}/approve`, { method: 'POST' })
	},

	deny(id: string) {
		return apiFetch(`/api/agent/permissions/${id}/deny`, { method: 'POST' })
	},
}
