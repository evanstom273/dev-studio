import type {
	ClosePullRequestRequest,
	CommitAndPrRequest,
	CommitAndPrResponse,
	CreateGitHubRepoRequest,
	CreatePullRequestRequest,
	DeleteRepoRequest,
	GitHubAuthStatus,
	GitHubPullRequest,
	GitHubPullRequestDetail,
	GitHubPullRequestState,
	GitHubRepoDetails,
	LinkRemoteRequest,
	MergeAndSyncRequest,
	MergeAndSyncResponse,
	MergePullRequestRequest,
	UpdatePullRequestRequest,
	UpdateRepoRequest,
} from '@shared/types/github'
import { apiFetch } from './apiClient'

function projectPath(projectId: string): string {
	return `/api/github/${projectId}`
}

export const githubApi = {
	authStatus(): Promise<GitHubAuthStatus> {
		return apiFetch('/api/github/auth')
	},

	getRateLimit(): Promise<import('@shared/types/github').GitHubRateLimits> {
		return apiFetch('/api/github/rate-limit')
	},

	getWorkflows(projectId: string, limit = 10): Promise<import('@shared/types/github').GitHubWorkflowsResponse> {
		return apiFetch(`${projectPath(projectId)}/workflows?limit=${limit}`)
	},

	listUserRepos(): Promise<import('@shared/types/github').GitHubRepoSummary[]> {
		return apiFetch('/api/github/repos')
	},

	getRepo(projectId: string): Promise<GitHubRepoDetails | null> {
		return apiFetch(`${projectPath(projectId)}/repo`)
	},

	createRepo(projectId: string, body: CreateGitHubRepoRequest): Promise<GitHubRepoDetails> {
		return apiFetch(`${projectPath(projectId)}/repo`, { method: 'POST', body: JSON.stringify(body) })
	},

	linkRemote(projectId: string, body: LinkRemoteRequest): Promise<void> {
		return apiFetch(`${projectPath(projectId)}/repo/link-remote`, { method: 'POST', body: JSON.stringify(body) })
	},

	updateRepo(projectId: string, body: UpdateRepoRequest): Promise<void> {
		return apiFetch(`${projectPath(projectId)}/repo`, { method: 'PATCH', body: JSON.stringify(body) })
	},

	deleteRepo(projectId: string, body: DeleteRepoRequest): Promise<void> {
		return apiFetch(`${projectPath(projectId)}/repo`, { method: 'DELETE', body: JSON.stringify(body) })
	},

	listPullRequests(projectId: string, state: GitHubPullRequestState = 'open', limit = 50): Promise<GitHubPullRequest[]> {
		return apiFetch(`${projectPath(projectId)}/prs?state=${state}&limit=${limit}`)
	},

	getPullRequest(projectId: string, number: number): Promise<GitHubPullRequestDetail> {
		return apiFetch(`${projectPath(projectId)}/prs/${number}`)
	},

	createPullRequest(projectId: string, body: CreatePullRequestRequest): Promise<GitHubPullRequest> {
		return apiFetch(`${projectPath(projectId)}/prs`, { method: 'POST', body: JSON.stringify(body) })
	},

	updatePullRequest(projectId: string, number: number, body: Omit<UpdatePullRequestRequest, 'number'>): Promise<void> {
		return apiFetch(`${projectPath(projectId)}/prs/${number}`, { method: 'PATCH', body: JSON.stringify(body) })
	},

	mergePullRequest(projectId: string, body: MergePullRequestRequest): Promise<void> {
		return apiFetch(`${projectPath(projectId)}/prs/merge`, { method: 'POST', body: JSON.stringify(body) })
	},

	closePullRequest(projectId: string, body: ClosePullRequestRequest): Promise<void> {
		return apiFetch(`${projectPath(projectId)}/prs/close`, { method: 'POST', body: JSON.stringify(body) })
	},

	reopenPullRequest(projectId: string, number: number): Promise<void> {
		return apiFetch(`${projectPath(projectId)}/prs/${number}/reopen`, { method: 'POST' })
	},

	commitAndOpenPr(projectId: string, body: CommitAndPrRequest): Promise<CommitAndPrResponse> {
		return apiFetch(`${projectPath(projectId)}/commit-pr`, { method: 'POST', body: JSON.stringify(body) })
	},

	mergeAndSync(projectId: string, body: MergeAndSyncRequest): Promise<MergeAndSyncResponse> {
		return apiFetch(`${projectPath(projectId)}/prs/merge-sync`, { method: 'POST', body: JSON.stringify(body) })
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
