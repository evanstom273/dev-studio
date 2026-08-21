import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
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
} from '../types/github.js'

const execFileAsync = promisify(execFile)

function parseRepoFromRemote(url: string): GitHubRepoInfo | null {
	const ssh = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
	if (ssh) return { owner: ssh[1], repo: ssh[2] }

	const https = url.match(/https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
	if (https) return { owner: https[1], repo: https[2] }

	return null
}

export class GitHubService {
	async authStatus(): Promise<GitHubAuthStatus> {
		try {
			const { stdout } = await execFileAsync('gh', ['auth', 'status'], { timeout: 5000 })
			const match = stdout.match(/account (\S+)/)
			return {
				authenticated: stdout.includes('Logged in'),
				username: match?.[1],
			}
		} catch {
			return { authenticated: false, message: 'Run: gh auth login' }
		}
	}

	async getRepoInfo(projectPath: string, remoteUrl: string | undefined): Promise<GitHubRepoInfo | null> {
		if (remoteUrl) {
			const parsed = parseRepoFromRemote(remoteUrl)
			if (parsed) return { ...parsed, remoteUrl }
		}

		try {
			const { stdout } = await execFileAsync('gh', ['repo', 'view', '--json', 'name,owner,url'], {
				cwd: projectPath,
				timeout: 10000,
			})
			const data = JSON.parse(stdout) as { name: string; owner: { login: string }; url: string }
			return { owner: data.owner.login, repo: data.name, remoteUrl: data.url }
		} catch {
			return null
		}
	}

	async createRepo(req: CreateGitHubRepoRequest, projectPath: string): Promise<GitHubRepo> {
		const args = ['repo', 'create', req.name, '--source', projectPath, '--remote', 'origin']
		if (req.description) args.push('--description', req.description)
		args.push(req.private ? '--private' : '--public')

		const { stdout } = await execFileAsync('gh', args, { cwd: projectPath, timeout: 60000 })
		const urlMatch = stdout.match(/https:\/\/github\.com\/\S+/)
		return {
			name: req.name,
			fullName: req.name,
			url: urlMatch?.[0] ?? `https://github.com/${req.name}`,
			defaultBranch: 'main',
			private: req.private ?? false,
			description: req.description,
		}
	}

	async listPullRequests(projectPath: string): Promise<GitHubPullRequest[]> {
		const { stdout } = await execFileAsync(
			'gh',
			[
				'pr',
				'list',
				'--json',
				'number,title,state,author,baseRefName,headRefName,url,createdAt,mergeable',
				'--limit',
				'50',
			],
			{ cwd: projectPath, timeout: 15000 },
		)

		const items = JSON.parse(stdout) as Array<{
			number: number
			title: string
			state: string
			author: { login: string }
			baseRefName: string
			headRefName: string
			url: string
			createdAt: string
			mergeable?: string
		}>

		return items.map((pr) => ({
			number: pr.number,
			title: pr.title,
			state: pr.state as GitHubPullRequest['state'],
			author: pr.author.login,
			baseBranch: pr.baseRefName,
			headBranch: pr.headRefName,
			url: pr.url,
			createdAt: pr.createdAt,
			mergeable: pr.mergeable === 'MERGEABLE',
		}))
	}

	async createPullRequest(projectPath: string, req: CreatePullRequestRequest): Promise<GitHubPullRequest> {
		const args = ['pr', 'create', '--title', req.title, '--json', 'number,title,state,author,baseRefName,headRefName,url,createdAt']
		if (req.body) args.push('--body', req.body)
		if (req.base) args.push('--base', req.base)
		if (req.head) args.push('--head', req.head)

		const { stdout } = await execFileAsync('gh', args, { cwd: projectPath, timeout: 30000 })
		const pr = JSON.parse(stdout) as {
			number: number
			title: string
			state: string
			author: { login: string }
			baseRefName: string
			headRefName: string
			url: string
			createdAt: string
		}

		return {
			number: pr.number,
			title: pr.title,
			state: pr.state as GitHubPullRequest['state'],
			author: pr.author.login,
			baseBranch: pr.baseRefName,
			headBranch: pr.headRefName,
			url: pr.url,
			createdAt: pr.createdAt,
		}
	}

	async mergePullRequest(projectPath: string, req: MergePullRequestRequest): Promise<void> {
		const methodFlag = req.method === 'squash' ? '--squash' : req.method === 'rebase' ? '--rebase' : '--merge'
		await execFileAsync('gh', ['pr', 'merge', String(req.number), methodFlag], {
			cwd: projectPath,
			timeout: 30000,
		})
	}

	async updateRepo(projectPath: string, info: GitHubRepoInfo, req: UpdateRepoRequest): Promise<void> {
		const args = ['repo', 'edit', `${info.owner}/${info.repo}`]
		if (req.description !== undefined) args.push('--description', req.description)
		if (req.homepage !== undefined) args.push('--homepage', req.homepage)
		if (req.visibility) args.push(`--${req.visibility}`)
		else if (req.private !== undefined) args.push(req.private ? '--private' : '--public')

		await execFileAsync('gh', args, { cwd: projectPath, timeout: 15000 })
	}

	async deleteRepo(info: GitHubRepoInfo, req: DeleteRepoRequest): Promise<void> {
		const expected = `${info.owner}/${info.repo}`
		if (req.confirmation !== expected) {
			throw new Error(`Confirmation must exactly match: ${expected}`)
		}
		await execFileAsync('gh', ['repo', 'delete', expected, '--yes'], { timeout: 30000 })
	}
}
