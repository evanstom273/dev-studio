export type GitHubAuthStatus = {
	authenticated: boolean
	username?: string
	scopes?: string[]
	message?: string
}

export type GitHubRepoInfo = {
	owner: string
	repo: string
	remoteUrl?: string
}

export type GitHubRepo = {
	name: string
	fullName: string
	url: string
	defaultBranch: string
	private: boolean
	description?: string
}

export type GitHubRepoDetails = {
	owner: string
	repo: string
	fullName: string
	url: string
	description: string
	homepage: string
	visibility: 'public' | 'private' | 'internal'
	defaultBranch: string
	isPrivate: boolean
	isFork: boolean
	starCount: number
	forkCount: number
	openIssueCount: number
	updatedAt: string
	pushedAt: string
	remoteUrl?: string
}

export type GitHubPullRequestState = 'open' | 'closed' | 'merged' | 'all'

export type GitHubPullRequest = {
	number: number
	title: string
	state: 'open' | 'closed' | 'merged'
	author: string
	baseBranch: string
	headBranch: string
	url: string
	createdAt: string
	updatedAt?: string
	mergeable?: boolean
	body?: string
	additions?: number
	deletions?: number
	changedFiles?: number
	labels?: string[]
	isDraft?: boolean
}

export type GitHubPullRequestReview = {
	author: string
	state: string
	submittedAt: string
}

export type GitHubPullRequestDetail = GitHubPullRequest & {
	body: string
	commits: number
	reviews: GitHubPullRequestReview[]
	checksStatus?: 'success' | 'failure' | 'pending' | 'none'
}

export type CreateGitHubRepoRequest = {
	name: string
	description?: string
	private?: boolean
	push?: boolean
}

export type CreatePullRequestRequest = {
	title: string
	body?: string
	base?: string
	head?: string
	draft?: boolean
}

export type UpdatePullRequestRequest = {
	number: number
	title?: string
	body?: string
}

export type MergePullRequestRequest = {
	number: number
	method?: 'merge' | 'squash' | 'rebase'
	deleteBranch?: boolean
}

export type ClosePullRequestRequest = {
	number: number
}

export type UpdateRepoRequest = {
	description?: string
	homepage?: string
	private?: boolean
	visibility?: 'public' | 'private'
	defaultBranch?: string
}

export type DeleteRepoRequest = {
	confirmation: string
}

export type LinkRemoteRequest = {
	url: string
	name?: string
}

export type PullRequestListQuery = {
	state?: GitHubPullRequestState
	limit?: number
}

export type CommitAndPrRequest = {
	message: string
	description?: string
	branch?: string
	draft?: boolean
}

export type CommitAndPrResponse = {
	hash: string
	branch: string
	pr: GitHubPullRequest | null
	message: string
}

export type MergeAndSyncRequest = {
	number: number
	method?: 'merge' | 'squash' | 'rebase'
	deleteBranch?: boolean
}

export type MergeAndSyncResponse = {
	merged: boolean
	currentBranch: string
}

