import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
	ClosePullRequestRequest,
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
	MergePullRequestRequest,
	UpdatePullRequestRequest,
	UpdateRepoRequest,
} from '../types/github.js'
import { GitService } from './gitService.js'

const execFileAsync = promisify(execFile)

function ghArgs(projectPath: string): { cwd: string; timeout: number } {
	return { cwd: projectPath, timeout: 30000 }
}

function parseRepoFromRemote(url: string): GitHubRepoInfo | null {
	const ssh = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
	if (ssh) return { owner: ssh[1], repo: ssh[2], remoteUrl: url }

	const https = url.match(/https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
	if (https) return { owner: https[1], repo: https[2], remoteUrl: url }

	return null
}

type GhPrJson = {
	number: number
	title: string
	body?: string
	state: string
	isDraft?: boolean
	author: { login: string }
	baseRefName: string
	headRefName: string
	url: string
	createdAt: string
	updatedAt?: string
	mergeable?: string
	additions?: number
	deletions?: number
	changedFiles?: number
	labels?: Array<{ name: string }>
	commits?: { totalCount: number }
	reviews?: Array<{ author: { login: string }; state: string; submittedAt: string }>
	statusCheckRollup?: Array<{ state: string }>
}

function mapPullRequest(pr: GhPrJson): GitHubPullRequest {
	return {
		number: pr.number,
		title: pr.title,
		state: pr.state as GitHubPullRequest['state'],
		author: pr.author.login,
		baseBranch: pr.baseRefName,
		headBranch: pr.headRefName,
		url: pr.url,
		createdAt: pr.createdAt,
		updatedAt: pr.updatedAt,
		mergeable: pr.mergeable === 'MERGEABLE',
		body: pr.body,
		additions: pr.additions,
		deletions: pr.deletions,
		changedFiles: pr.changedFiles,
		labels: pr.labels?.map((l) => l.name),
		isDraft: pr.isDraft,
	}
}

function mapChecksStatus(checks?: Array<{ state: string }>): GitHubPullRequestDetail['checksStatus'] {
	if (!checks?.length) return 'none'
	if (checks.every((c) => c.state === 'SUCCESS')) return 'success'
	if (checks.some((c) => c.state === 'FAILURE' || c.state === 'ERROR')) return 'failure'
	return 'pending'
}

export class GitHubService {
	private git = new GitService()

	async authStatus(): Promise<GitHubAuthStatus> {
		try {
			const { stdout } = await execFileAsync('gh', ['auth', 'status'], { timeout: 5000 })
			const userMatch = stdout.match(/account (\S+)/)
			const scopesMatch = stdout.match(/Token scopes: (.+)/)
			return {
				authenticated: stdout.includes('Logged in'),
				username: userMatch?.[1],
				scopes: scopesMatch?.[1]?.split(',').map((s) => s.trim()),
			}
		} catch {
			return { authenticated: false, message: 'Run: gh auth login' }
		}
	}

	async getRepoInfo(projectPath: string, remoteUrl: string | undefined): Promise<GitHubRepoInfo | null> {
		if (remoteUrl) {
			const parsed = parseRepoFromRemote(remoteUrl)
			if (parsed) return parsed
		}

		try {
			const { stdout } = await execFileAsync(
				'gh',
				['repo', 'view', '--json', 'name,owner,url'],
				ghArgs(projectPath),
			)
			const data = JSON.parse(stdout) as { name: string; owner: { login: string }; url: string }
			return { owner: data.owner.login, repo: data.name, remoteUrl: data.url }
		} catch {
			return null
		}
	}

	async getRepoDetails(projectPath: string, remoteUrl: string | undefined): Promise<GitHubRepoDetails | null> {
		try {
			const { stdout } = await execFileAsync(
				'gh',
				[
					'repo',
					'view',
					'--json',
					'name,owner,description,visibility,url,homepageUrl,isPrivate,isFork,defaultBranchRef,stargazerCount,forkCount,issues,updatedAt,pushedAt',
				],
				ghArgs(projectPath),
			)
			const data = JSON.parse(stdout) as {
				name: string
				owner: { login: string }
				description: string
				visibility: string
				url: string
				homepageUrl: string
				isPrivate: boolean
				isFork: boolean
				defaultBranchRef: { name: string }
				stargazerCount: number
				forkCount: number
				issues: { totalCount: number }
				updatedAt: string
				pushedAt: string
			}

			const parsed = remoteUrl ? parseRepoFromRemote(remoteUrl) : null

			return {
				owner: data.owner.login,
				repo: data.name,
				fullName: `${data.owner.login}/${data.name}`,
				url: data.url,
				description: data.description ?? '',
				homepage: data.homepageUrl ?? '',
				visibility: (data.visibility?.toLowerCase() ?? 'public') as GitHubRepoDetails['visibility'],
				defaultBranch: data.defaultBranchRef?.name ?? 'main',
				isPrivate: data.isPrivate,
				isFork: data.isFork,
				starCount: data.stargazerCount,
				forkCount: data.forkCount,
				openIssueCount: data.issues?.totalCount ?? 0,
				updatedAt: data.updatedAt,
				pushedAt: data.pushedAt,
				remoteUrl: parsed?.remoteUrl ?? data.url,
			}
		} catch {
			return null
		}
	}

	async createRepo(req: CreateGitHubRepoRequest, projectPath: string): Promise<GitHubRepo> {
		const args = ['repo', 'create', req.name, '--source', projectPath, '--remote', 'origin']
		if (req.description) args.push('--description', req.description)
		args.push(req.private ? '--private' : '--public')
		if (req.push !== false) args.push('--push')

		await execFileAsync('gh', args, { ...ghArgs(projectPath), timeout: 120000 })

		const details = await this.getRepoDetails(projectPath, undefined)
		if (details) {
			return {
				name: details.repo,
				fullName: details.fullName,
				url: details.url,
				defaultBranch: details.defaultBranch,
				private: details.isPrivate,
				description: details.description,
			}
		}

		return {
			name: req.name,
			fullName: req.name,
			url: `https://github.com/${req.name}`,
			defaultBranch: 'main',
			private: req.private ?? false,
			description: req.description,
		}
	}

	async linkRemote(projectPath: string, req: LinkRemoteRequest): Promise<void> {
		const name = req.name ?? 'origin'
		const hasRemote = await this.git.hasRemote(projectPath)
		if (hasRemote) {
			const { simpleGit } = await import('simple-git')
			await simpleGit({ baseDir: projectPath }).removeRemote(name).catch(() => {})
		}
		await this.git.addRemote(projectPath, name, req.url)
	}

	async listPullRequests(
		projectPath: string,
		state: GitHubPullRequestState = 'open',
		limit = 50,
	): Promise<GitHubPullRequest[]> {
		const { stdout } = await execFileAsync(
			'gh',
			[
				'pr',
				'list',
				'--state',
				state,
				'--json',
				'number,title,body,state,isDraft,author,baseRefName,headRefName,url,createdAt,updatedAt,mergeable,additions,deletions,changedFiles,labels',
				'--limit',
				String(limit),
			],
			ghArgs(projectPath),
		)

		const items = JSON.parse(stdout) as GhPrJson[]
		return items.map(mapPullRequest)
	}

	async getPullRequest(projectPath: string, number: number): Promise<GitHubPullRequestDetail> {
		const { stdout } = await execFileAsync(
			'gh',
			[
				'pr',
				'view',
				String(number),
				'--json',
				'number,title,body,state,isDraft,author,baseRefName,headRefName,url,createdAt,updatedAt,mergeable,additions,deletions,changedFiles,labels,commits,reviews,statusCheckRollup',
			],
			ghArgs(projectPath),
		)

		const pr = JSON.parse(stdout) as GhPrJson & {
			commits?: { totalCount: number }
			reviews?: Array<{ author: { login: string }; state: string; submittedAt: string }>
			statusCheckRollup?: Array<{ state: string }>
		}

		return {
			...mapPullRequest(pr),
			body: pr.body ?? '',
			commits: pr.commits?.totalCount ?? 0,
			reviews: (pr.reviews ?? []).map((r) => ({
				author: r.author.login,
				state: r.state,
				submittedAt: r.submittedAt,
			})),
			checksStatus: mapChecksStatus(pr.statusCheckRollup),
		}
	}

	async createPullRequest(projectPath: string, req: CreatePullRequestRequest): Promise<GitHubPullRequest> {
		const args = [
			'pr',
			'create',
			'--title',
			req.title,
			'--json',
			'number,title,state,author,baseRefName,headRefName,url,createdAt',
		]
		if (req.body) args.push('--body', req.body)
		if (req.base) args.push('--base', req.base)
		if (req.head) args.push('--head', req.head)
		if (req.draft) args.push('--draft')

		const { stdout } = await execFileAsync('gh', args, ghArgs(projectPath))
		return mapPullRequest(JSON.parse(stdout) as GhPrJson)
	}

	async updatePullRequest(projectPath: string, req: UpdatePullRequestRequest): Promise<void> {
		const args = ['pr', 'edit', String(req.number)]
		if (req.title) args.push('--title', req.title)
		if (req.body !== undefined) args.push('--body', req.body)
		await execFileAsync('gh', args, ghArgs(projectPath))
	}

	async mergePullRequest(projectPath: string, req: MergePullRequestRequest): Promise<void> {
		const args = ['pr', 'merge', String(req.number)]
		if (req.method === 'squash') args.push('--squash')
		else if (req.method === 'rebase') args.push('--rebase')
		else args.push('--merge')
		if (req.deleteBranch) args.push('--delete-branch')
		await execFileAsync('gh', args, ghArgs(projectPath))
	}

	async closePullRequest(projectPath: string, req: ClosePullRequestRequest): Promise<void> {
		await execFileAsync('gh', ['pr', 'close', String(req.number)], ghArgs(projectPath))
	}

	async reopenPullRequest(projectPath: string, number: number): Promise<void> {
		await execFileAsync('gh', ['pr', 'reopen', String(number)], ghArgs(projectPath))
	}

	async updateRepo(projectPath: string, info: GitHubRepoInfo, req: UpdateRepoRequest): Promise<void> {
		const args = ['repo', 'edit', `${info.owner}/${info.repo}`]
		if (req.description !== undefined) args.push('--description', req.description)
		if (req.homepage !== undefined) args.push('--homepage', req.homepage)
		if (req.defaultBranch) args.push('--default-branch', req.defaultBranch)
		if (req.visibility) args.push(`--${req.visibility}`)
		else if (req.private !== undefined) args.push(req.private ? '--private' : '--public')

		await execFileAsync('gh', args, ghArgs(projectPath))
	}

	async deleteRepo(info: GitHubRepoInfo, req: DeleteRepoRequest): Promise<void> {
		const expected = `${info.owner}/${info.repo}`
		if (req.confirmation !== expected) {
			throw new Error(`Confirmation must exactly match: ${expected}`)
		}
		await execFileAsync('gh', ['repo', 'delete', expected, '--yes'], { timeout: 60000 })
	}
}
