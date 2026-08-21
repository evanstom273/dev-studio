import type { GitHubAuthStatus } from '../types/github.js'

const GITHUB_API = 'https://api.github.com'

export type GitHubApiRepo = {
	id: number
	name: string
	full_name: string
	html_url: string
	description: string | null
	homepage: string | null
	private: boolean
	fork: boolean
	default_branch: string
	stargazers_count: number
	forks_count: number
	open_issues_count: number
	updated_at: string
	pushed_at: string
	visibility?: string
	owner: { login: string }
}

export type GitHubApiPull = {
	number: number
	title: string
	body: string | null
	state: 'open' | 'closed'
	draft?: boolean
	user: { login: string } | null
	base: { ref: string }
	head: { ref: string; sha?: string }
	html_url: string
	created_at: string
	updated_at: string
	merged_at: string | null
	mergeable: boolean | null
	additions?: number
	deletions?: number
	changed_files?: number
	labels?: Array<{ name: string }>
}

export type GitHubApiReview = {
	user: { login: string } | null
	state: string
	submitted_at: string
}

export type GitHubApiCommitStatus = {
	state: 'pending' | 'success' | 'failure' | 'error'
}

export class GitHubApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message)
		this.name = 'GitHubApiError'
	}
}

export class GitHubRestClient {
	constructor(private token: string) {}

	hasToken(): boolean {
		return Boolean(this.token)
	}

	authenticatedRemoteUrl(owner: string, repo: string): string {
		const encoded = encodeURIComponent(this.token)
		return `https://x-access-token:${encoded}@github.com/${owner}/${repo}.git`
	}

	async authStatus(): Promise<GitHubAuthStatus> {
		if (!this.token) {
			return {
				authenticated: false,
				message: 'Add your GitHub token in Settings',
			}
		}

		try {
			const { data, scopes } = await this.request<{ login: string }>('/user')
			return {
				authenticated: true,
				username: data.login,
				scopes,
			}
		} catch (error) {
			return {
				authenticated: false,
				message: error instanceof Error ? error.message : 'GitHub authentication failed',
			}
		}
	}

	async getRepo(owner: string, repo: string): Promise<GitHubApiRepo> {
		const { data } = await this.request<GitHubApiRepo>(`/repos/${owner}/${repo}`)
		return data
	}

	async createRepo(body: {
		name: string
		description?: string
		private?: boolean
		auto_init?: boolean
	}): Promise<GitHubApiRepo> {
		const { data } = await this.request<GitHubApiRepo>('/user/repos', {
			method: 'POST',
			body: JSON.stringify({
				name: body.name,
				description: body.description,
				private: body.private ?? false,
				auto_init: body.auto_init ?? false,
			}),
		})
		return data
	}

	async listUserRepos(perPage = 100): Promise<GitHubApiRepo[]> {
		const { data } = await this.request<GitHubApiRepo[]>(
			`/user/repos?sort=updated&per_page=${Math.min(perPage, 100)}`,
		)
		return data
	}

	async updateRepo(
		owner: string,
		repo: string,
		body: {
			description?: string
			homepage?: string
			private?: boolean
			visibility?: 'public' | 'private'
			default_branch?: string
		},
	): Promise<void> {
		const payload: Record<string, unknown> = {}
		if (body.description !== undefined) payload.description = body.description
		if (body.homepage !== undefined) payload.homepage = body.homepage
		if (body.default_branch) payload.default_branch = body.default_branch
		if (body.visibility) payload.visibility = body.visibility
		else if (body.private !== undefined) payload.private = body.private

		await this.request(`/repos/${owner}/${repo}`, {
			method: 'PATCH',
			body: JSON.stringify(payload),
		})
	}

	async deleteRepo(owner: string, repo: string): Promise<void> {
		await this.request(`/repos/${owner}/${repo}`, { method: 'DELETE' })
	}

	async listPullRequests(
		owner: string,
		repo: string,
		state: 'open' | 'closed' | 'merged' | 'all',
		limit: number,
	): Promise<GitHubApiPull[]> {
		if (state === 'merged' || state === 'closed') {
			const { data } = await this.request<GitHubApiPull[]>(
				`/repos/${owner}/${repo}/pulls?state=closed&per_page=${Math.min(limit, 100)}`,
			)
			const filtered =
				state === 'merged'
					? data.filter((pr) => pr.merged_at)
					: data.filter((pr) => !pr.merged_at)
			return filtered.slice(0, limit)
		}

		const apiState = state === 'all' ? 'all' : 'open'
		const { data } = await this.request<GitHubApiPull[]>(
			`/repos/${owner}/${repo}/pulls?state=${apiState}&per_page=${Math.min(limit, 100)}`,
		)
		return data.slice(0, limit)
	}

	async getPullRequest(owner: string, repo: string, number: number): Promise<GitHubApiPull> {
		const { data } = await this.request<GitHubApiPull>(`/repos/${owner}/${repo}/pulls/${number}`)
		return data
	}

	async listPullRequestReviews(owner: string, repo: string, number: number): Promise<GitHubApiReview[]> {
		const { data } = await this.request<GitHubApiReview[]>(
			`/repos/${owner}/${repo}/pulls/${number}/reviews`,
		)
		return data
	}

	async listPullRequestCommits(owner: string, repo: string, number: number): Promise<unknown[]> {
		const { data } = await this.request<unknown[]>(
			`/repos/${owner}/${repo}/pulls/${number}/commits?per_page=100`,
		)
		return data
	}

	async getCommitStatus(owner: string, repo: string, ref: string): Promise<GitHubApiCommitStatus | null> {
		try {
			const { data } = await this.request<GitHubApiCommitStatus>(
				`/repos/${owner}/${repo}/commits/${ref}/status`,
			)
			return data
		} catch {
			return null
		}
	}

	async createPullRequest(
		owner: string,
		repo: string,
		body: {
			title: string
			body?: string
			base?: string
			head?: string
			draft?: boolean
		},
	): Promise<GitHubApiPull> {
		const { data } = await this.request<GitHubApiPull>(`/repos/${owner}/${repo}/pulls`, {
			method: 'POST',
			body: JSON.stringify({
				title: body.title,
				body: body.body,
				base: body.base,
				head: body.head,
				draft: body.draft,
			}),
		})
		return data
	}

	async updatePullRequest(
		owner: string,
		repo: string,
		number: number,
		body: { title?: string; body?: string; state?: 'open' | 'closed' },
	): Promise<void> {
		await this.request(`/repos/${owner}/${repo}/pulls/${number}`, {
			method: 'PATCH',
			body: JSON.stringify(body),
		})
	}

	async mergePullRequest(
		owner: string,
		repo: string,
		number: number,
		body: { merge_method?: 'merge' | 'squash' | 'rebase'; delete_branch?: boolean },
	): Promise<void> {
		await this.request(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
			method: 'PUT',
			body: JSON.stringify({
				merge_method: body.merge_method ?? 'merge',
				delete_branch: body.delete_branch,
			}),
		})
	}

	private async request<T>(
		path: string,
		init: RequestInit = {},
	): Promise<{ data: T; scopes?: string[] }> {
		if (!this.token) {
			throw new GitHubApiError('GitHub token not configured — add it in Settings on your phone', 401)
		}

		const headers = new Headers(init.headers)
		headers.set('Authorization', `Bearer ${this.token}`)
		headers.set('Accept', 'application/vnd.github+json')
		headers.set('X-GitHub-Api-Version', '2022-11-28')
		if (init.body && !headers.has('Content-Type')) {
			headers.set('Content-Type', 'application/json')
		}

		const response = await fetch(`${GITHUB_API}${path}`, { ...init, headers })

		const scopesHeader = response.headers.get('x-oauth-scopes')
		const scopes = scopesHeader
			? scopesHeader.split(',').map((scope) => scope.trim()).filter(Boolean)
			: undefined

		if (response.status === 204) {
			return { data: undefined as T, scopes }
		}

		const text = await response.text()
		let payload: unknown = null
		if (text) {
			try {
				payload = JSON.parse(text) as unknown
			} catch {
				payload = text
			}
		}

		if (!response.ok) {
			const message =
				typeof payload === 'object' &&
				payload !== null &&
				'message' in payload &&
				typeof (payload as { message: unknown }).message === 'string'
					? (payload as { message: string }).message
					: `GitHub API error (${response.status})`
			throw new GitHubApiError(message, response.status)
		}

		return { data: payload as T, scopes }
	}
}

export async function checkGitHubApi(token: string): Promise<{
	available: boolean
	path: string
	authenticated?: boolean
	version?: string
	message?: string
}> {
	if (!token) {
		return {
			available: false,
			path: 'GitHub REST API',
			authenticated: false,
			message: 'Add your GitHub token in Settings',
		}
	}

	try {
		const client = new GitHubRestClient(token)
		const status = await client.authStatus()
		return {
			available: true,
			path: 'GitHub REST API',
			authenticated: status.authenticated,
			version: status.username,
			message: status.authenticated
				? undefined
				: (status.message ?? 'Invalid or expired PAT'),
		}
	} catch (error) {
		return {
			available: true,
			path: 'GitHub REST API',
			authenticated: false,
			message: error instanceof Error ? error.message : 'GitHub API unreachable',
		}
	}
}
