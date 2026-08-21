import { simpleGit } from 'simple-git'
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
	GitHubRepo,
	GitHubRepoDetails,
	GitHubRepoInfo,
	LinkRemoteRequest,
	MergeAndSyncRequest,
	MergeAndSyncResponse,
	MergePullRequestRequest,
	UpdatePullRequestRequest,
	UpdateRepoRequest,
} from '../types/github.js'
import { runShell } from '../utils/exec.js'
import { GitService } from './gitService.js'
import { GitHubRestClient, type GitHubApiPull } from './githubRestClient.js'

function parseRepoFromRemote(url: string): GitHubRepoInfo | null {
	const ssh = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
	if (ssh) return { owner: ssh[1], repo: ssh[2], remoteUrl: url }

	const https = url.match(/https:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
	if (https) return { owner: https[1], repo: https[2], remoteUrl: url }

	return null
}

function mapPullState(pr: GitHubApiPull): GitHubPullRequest['state'] {
	if (pr.merged_at) return 'merged'
	return pr.state
}

function mapPullRequest(pr: GitHubApiPull): GitHubPullRequest {
	return {
		number: pr.number,
		title: pr.title,
		state: mapPullState(pr),
		author: pr.user?.login ?? 'unknown',
		baseBranch: pr.base.ref,
		headBranch: pr.head.ref,
		url: pr.html_url,
		createdAt: pr.created_at,
		updatedAt: pr.updated_at,
		mergeable: pr.mergeable ?? undefined,
		body: pr.body ?? undefined,
		additions: pr.additions,
		deletions: pr.deletions,
		changedFiles: pr.changed_files,
		labels: pr.labels?.map((label) => label.name),
		isDraft: pr.draft,
	}
}

function mapChecksStatus(state?: string | null): GitHubPullRequestDetail['checksStatus'] {
	if (!state || state === 'unknown') return 'none'
	if (state === 'success') return 'success'
	if (state === 'failure' || state === 'error') return 'failure'
	return 'pending'
}

export class GitHubService {
	private git = new GitService()
	private client: GitHubRestClient

	constructor(token: string) {
		this.client = new GitHubRestClient(token)
	}

	async authStatus(): Promise<GitHubAuthStatus> {
		return this.client.authStatus()
	}

	async listUserRepos(): Promise<Array<{
		id: number
		name: string
		fullName: string
		private: boolean
		url: string
		description: string
		updatedAt: string
		defaultBranch: string
	}>> {
		const repos = await this.client.listUserRepos()
		return repos.map((repo) => ({
			id: repo.id ?? 0,
			name: repo.name,
			fullName: repo.full_name,
			private: repo.private,
			url: repo.html_url,
			description: repo.description ?? '',
			updatedAt: repo.updated_at,
			defaultBranch: repo.default_branch,
		}))
	}

	private async getOriginRemote(projectPath: string): Promise<string | undefined> {
		try {
			const remotes = await simpleGit({ baseDir: projectPath }).getRemotes(true)
			return remotes.find((remote) => remote.name === 'origin')?.refs.fetch
		} catch {
			return undefined
		}
	}

	async getRepoInfo(projectPath: string, remoteUrl: string | undefined): Promise<GitHubRepoInfo | null> {
		const url = remoteUrl ?? (await this.getOriginRemote(projectPath))
		if (!url) return null
		return parseRepoFromRemote(url)
	}

	private async requireRepo(projectPath: string, remoteUrl?: string): Promise<GitHubRepoInfo> {
		const info = await this.getRepoInfo(projectPath, remoteUrl)
		if (!info) throw new Error('No GitHub repository linked')
		return info
	}

	async getRepoDetails(projectPath: string, remoteUrl: string | undefined): Promise<GitHubRepoDetails | null> {
		const info = await this.getRepoInfo(projectPath, remoteUrl)
		if (!info) return null

		try {
			const data = await this.client.getRepo(info.owner, info.repo)
			return {
				owner: data.owner.login,
				repo: data.name,
				fullName: data.full_name,
				url: data.html_url,
				description: data.description ?? '',
				homepage: data.homepage ?? '',
				visibility: (data.visibility?.toLowerCase() ?? (data.private ? 'private' : 'public')) as GitHubRepoDetails['visibility'],
				defaultBranch: data.default_branch,
				isPrivate: data.private,
				isFork: data.fork,
				starCount: data.stargazers_count,
				forkCount: data.forks_count,
				openIssueCount: data.open_issues_count,
				updatedAt: data.updated_at,
				pushedAt: data.pushed_at,
				remoteUrl: info.remoteUrl ?? data.html_url,
			}
		} catch {
			return null
		}
	}

	async createRepo(req: CreateGitHubRepoRequest, projectPath: string): Promise<GitHubRepo> {
		const data = await this.client.createRepo({
			name: req.name,
			description: req.description,
			private: req.private,
		})

		const remoteUrl = `https://github.com/${data.full_name}.git`
		await this.linkRemote(projectPath, { url: remoteUrl, name: 'origin' })

		if (req.push !== false) {
			const branch = (await this.git.getDefaultBranch(projectPath)) ?? data.default_branch ?? 'main'
			await this.pushWithToken(projectPath, data.owner.login, data.name, branch)
		}

		return {
			name: data.name,
			fullName: data.full_name,
			url: data.html_url,
			defaultBranch: data.default_branch,
			private: data.private,
			description: data.description ?? undefined,
		}
	}

	private async pushWithToken(
		projectPath: string,
		owner: string,
		repo: string,
		branch: string,
	): Promise<void> {
		if (!this.client.hasToken()) {
			throw new Error('GitHub token not configured — add it in Settings on your phone')
		}

		const pushUrl = this.client.authenticatedRemoteUrl(owner, repo)
		const result = await runShell(
			projectPath,
			`git push -u "${pushUrl}" HEAD:"${branch}"`,
			120000,
		)
		if (result.exitCode !== 0) {
			throw new Error(result.stderr || result.stdout || 'Git push failed')
		}
	}

	async linkRemote(projectPath: string, req: LinkRemoteRequest): Promise<void> {
		const name = req.name ?? 'origin'
		const hasRemote = await this.git.hasRemote(projectPath)
		if (hasRemote) {
			await simpleGit({ baseDir: projectPath }).removeRemote(name).catch(() => {})
		}
		await this.git.addRemote(projectPath, name, req.url)
	}

	async listPullRequests(
		projectPath: string,
		state: GitHubPullRequestState = 'open',
		limit = 50,
	): Promise<GitHubPullRequest[]> {
		const info = await this.requireRepo(projectPath)
		const items = await this.client.listPullRequests(info.owner, info.repo, state, limit)
		return items.map(mapPullRequest)
	}

	async getPullRequest(projectPath: string, number: number): Promise<GitHubPullRequestDetail> {
		const info = await this.requireRepo(projectPath)
		const [pr, reviews, commits] = await Promise.all([
			this.client.getPullRequest(info.owner, info.repo, number),
			this.client.listPullRequestReviews(info.owner, info.repo, number),
			this.client.listPullRequestCommits(info.owner, info.repo, number),
		])

		const headSha = pr.head.sha
		const checksStatus = headSha
			? mapChecksStatus((await this.client.getCommitStatus(info.owner, info.repo, headSha))?.state)
			: 'none'

		return {
			...mapPullRequest(pr),
			body: pr.body ?? '',
			commits: commits.length,
			reviews: reviews.map((review) => ({
				author: review.user?.login ?? 'unknown',
				state: review.state,
				submittedAt: review.submitted_at,
			})),
			checksStatus,
		}
	}

	async createPullRequest(projectPath: string, req: CreatePullRequestRequest): Promise<GitHubPullRequest> {
		const info = await this.requireRepo(projectPath)
		const pr = await this.client.createPullRequest(info.owner, info.repo, req)
		return mapPullRequest(pr)
	}

	async updatePullRequest(projectPath: string, req: UpdatePullRequestRequest): Promise<void> {
		const info = await this.requireRepo(projectPath)
		await this.client.updatePullRequest(info.owner, info.repo, req.number, {
			title: req.title,
			body: req.body,
		})
	}

	async mergePullRequest(projectPath: string, req: MergePullRequestRequest): Promise<void> {
		const info = await this.requireRepo(projectPath)
		await this.client.mergePullRequest(info.owner, info.repo, req.number, {
			merge_method: req.method,
			delete_branch: req.deleteBranch,
		})
	}

	async closePullRequest(projectPath: string, req: ClosePullRequestRequest): Promise<void> {
		const info = await this.requireRepo(projectPath)
		await this.client.updatePullRequest(info.owner, info.repo, req.number, { state: 'closed' })
	}

	async reopenPullRequest(projectPath: string, number: number): Promise<void> {
		const info = await this.requireRepo(projectPath)
		await this.client.updatePullRequest(info.owner, info.repo, number, { state: 'open' })
	}

	async updateRepo(_projectPath: string, info: GitHubRepoInfo, req: UpdateRepoRequest): Promise<void> {
		await this.client.updateRepo(info.owner, info.repo, {
			description: req.description,
			homepage: req.homepage,
			private: req.private,
			visibility: req.visibility,
			default_branch: req.defaultBranch,
		})
	}

	async deleteRepo(info: GitHubRepoInfo, req: DeleteRepoRequest): Promise<void> {
		const expected = `${info.owner}/${info.repo}`
		if (req.confirmation !== expected) {
			throw new Error(`Confirmation must exactly match: ${expected}`)
		}
		await this.client.deleteRepo(info.owner, info.repo)
	}

	async commitAndOpenPr(
		projectPath: string,
		req: CommitAndPrRequest,
		token?: string,
	): Promise<CommitAndPrResponse> {
		const status = await this.git.status(projectPath)
		if (status.clean) {
			throw new Error('No changes to commit')
		}

		// 1. Stage all changes automatically (no manual staging)
		await this.git.stageAll(projectPath)

		// 2. Determine target branch and default branch
		const defaultBranch = (await this.git.getDefaultBranch(projectPath)) || 'main'
		let currentBranch = status.branch || 'HEAD'

		if (req.branch?.trim() && req.branch.trim() !== currentBranch) {
			const branches = await this.git.branches(projectPath)
			const exists = branches.some((b) => b.name === req.branch!.trim())
			await this.git.checkout(projectPath, req.branch.trim(), !exists)
			currentBranch = req.branch.trim()
		} else if (currentBranch === defaultBranch || currentBranch === 'HEAD') {
			const slug = req.message
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/(^-|-$)/g, '')
				.slice(0, 30)
			const newBranch = slug ? `feat/${slug}` : `patch-${Date.now()}`
			await this.git.checkout(projectPath, newBranch, true)
			currentBranch = newBranch
		}

		// 3. Commit changes
		const fullCommitMsg = req.description?.trim()
			? `${req.message.trim()}\n\n${req.description.trim()}`
			: req.message.trim()
		const hash = await this.git.commit(projectPath, fullCommitMsg)

		// 4. Check if GitHub repo & token are available
		const repoInfo = await this.getRepoInfo(projectPath, undefined)
		if (!repoInfo || !this.client.hasToken()) {
			return {
				hash,
				branch: currentBranch,
				pr: null,
				message: 'Committed locally (GitHub not connected)',
			}
		}

		// Push branch to remote
		await this.git.push(projectPath, 'origin', currentBranch, false, token)

		// 5. Create or find existing PR
		let pr: GitHubPullRequest | null = null
		try {
			pr = await this.createPullRequest(projectPath, {
				title: req.message.trim(),
				body: req.description?.trim() || undefined,
				head: currentBranch,
				base: defaultBranch,
				draft: req.draft,
			})
		} catch (err) {
			const existingPrs = await this.listPullRequests(projectPath, 'open', 20).catch(() => [])
			const found = existingPrs.find((p) => p.headBranch === currentBranch)
			if (found) {
				pr = found
			} else {
				throw err
			}
		}

		return {
			hash,
			branch: currentBranch,
			pr,
			message: `Committed & created PR #${pr.number}`,
		}
	}

	async mergeAndSync(
		projectPath: string,
		req: MergeAndSyncRequest,
		token?: string,
	): Promise<MergeAndSyncResponse> {
		const pr = await this.getPullRequest(projectPath, req.number)
		const baseBranch = pr.baseBranch || 'main'

		await this.mergePullRequest(projectPath, req)

		// Switch back to base branch and pull latest merged changes
		await this.git.checkout(projectPath, baseBranch, false)
		await this.git.pull(projectPath, 'origin', baseBranch, false, token)

		return {
			merged: true,
			currentBranch: baseBranch,
		}
	}

	async getRateLimits(): Promise<import('../types/github.js').GitHubRateLimits> {
		return this.client.getRateLimit()
	}

	async getWorkflowsAndPages(
		projectPath: string,
		limit = 10,
	): Promise<import('../types/github.js').GitHubWorkflowsResponse> {
		const info = await this.getRepoInfo(projectPath, undefined)
		if (!info) {
			return { runs: [], pages: null }
		}

		const [runs, pages] = await Promise.all([
			this.client.listWorkflowRuns(info.owner, info.repo, limit),
			this.client.getPagesStatus(info.owner, info.repo),
		])

		return { runs, pages }
	}
}

