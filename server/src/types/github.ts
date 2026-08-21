export type GitHubAuthStatus = {
	authenticated: boolean
	username?: string
	message?: string
}

export type GitHubRepo = {
	name: string
	fullName: string
	url: string
	defaultBranch: string
	private: boolean
	description?: string
}

export type GitHubPullRequest = {
	number: number
	title: string
	state: 'open' | 'closed' | 'merged'
	author: string
	baseBranch: string
	headBranch: string
	url: string
	createdAt: string
	mergeable?: boolean
}

export type CreateGitHubRepoRequest = {
	name: string
	description?: string
	private?: boolean
}

export type CreatePullRequestRequest = {
	title: string
	body?: string
	base?: string
	head?: string
}

export type MergePullRequestRequest = {
	number: number
	method?: 'merge' | 'squash' | 'rebase'
}

export type UpdateRepoRequest = {
	description?: string
	homepage?: string
	private?: boolean
	visibility?: 'public' | 'private'
}

export type DeleteRepoRequest = {
	confirmation: string
}

export type GitHubRepoInfo = {
	owner: string
	repo: string
	remoteUrl?: string
}
