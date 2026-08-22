import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { ServerConfig } from '../config.js'
import type {
	Problem,
	ProblemFilter,
	ProblemSeverity,
	ProblemSummary,
} from '../types/problem.js'
import { GitService } from './gitService.js'
import { GitHubRestClient } from './githubRestClient.js'

const execAsync = promisify(exec)

export class ProblemService {
	private readonly problemsBaseDir: string
	private memoryCache = new Map<string, Problem[]>()
	private git = new GitService()

	constructor(config: ServerConfig) {
		this.problemsBaseDir = join(config.dataDir, 'problems')
	}

	async init(): Promise<void> {
		await mkdir(this.problemsBaseDir, { recursive: true })
	}

	private projectFile(projectId: string): string {
		const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_')
		return join(this.problemsBaseDir, `${safeId}.json`)
	}

	private async load(projectId: string): Promise<Problem[]> {
		if (this.memoryCache.has(projectId)) {
			return this.memoryCache.get(projectId)!
		}

		try {
			const filePath = this.projectFile(projectId)
			const raw = await readFile(filePath, 'utf8')
			const list = JSON.parse(raw) as Problem[]
			this.memoryCache.set(projectId, list)
			return list
		} catch {
			this.memoryCache.set(projectId, [])
			return []
		}
	}

	private async save(projectId: string, list: Problem[]): Promise<void> {
		this.memoryCache.set(projectId, list)
		try {
			await mkdir(this.problemsBaseDir, { recursive: true })
			await writeFile(this.projectFile(projectId), JSON.stringify(list, null, 2), 'utf8')
		} catch (err) {
			console.error(`Failed to save problems for ${projectId}:`, err)
		}
	}

	async list(projectId: string, filter?: ProblemFilter): Promise<Problem[]> {
		const all = await this.load(projectId)

		return all.filter((p) => {
			if (filter?.status === 'active' && p.resolved) return false
			if (filter?.status === 'resolved' && !p.resolved) return false
			if (filter?.severity && filter.severity !== 'all' && p.severity !== filter.severity) return false
			if (filter?.source && filter.source !== 'all' && p.source !== filter.source) return false
			if (filter?.search) {
				const q = filter.search.toLowerCase()
				const match =
					p.title.toLowerCase().includes(q) ||
					p.message.toLowerCase().includes(q) ||
					(p.file && p.file.toLowerCase().includes(q)) ||
					p.category.toLowerCase().includes(q)
				if (!match) return false
			}
			return true
		})
	}

	async get(projectId: string, problemId: string): Promise<Problem | null> {
		const list = await this.load(projectId)
		return list.find((p) => p.id === problemId) || null
	}

	async addProblem(projectId: string, problem: Omit<Problem, 'id' | 'createdAt' | 'updatedAt' | 'resolved'> & { id?: string }): Promise<Problem> {
		const list = await this.load(projectId)
		const now = new Date().toISOString()
		const id = problem.id || `prob_${Date.now()}_${randomUUID().slice(0, 6)}`

		const existingIdx = list.findIndex(
			(p) =>
				p.id === id ||
				(p.source === problem.source &&
					p.file === problem.file &&
					p.line === problem.line &&
					p.title === problem.title),
		)

		const fullProblem: Problem = {
			...problem,
			id,
			projectId,
			createdAt: existingIdx >= 0 ? list[existingIdx].createdAt : now,
			updatedAt: now,
			resolved: false,
		}

		if (existingIdx >= 0) {
			list[existingIdx] = fullProblem
		} else {
			list.unshift(fullProblem)
		}

		await this.save(projectId, list)
		return fullProblem
	}

	async resolveProblem(projectId: string, problemId: string): Promise<Problem | null> {
		const list = await this.load(projectId)
		const problem = list.find((p) => p.id === problemId)
		if (!problem) return null

		problem.resolved = true
		problem.resolvedAt = new Date().toISOString()
		problem.updatedAt = new Date().toISOString()

		await this.save(projectId, list)
		return problem
	}

	async reopenProblem(projectId: string, problemId: string): Promise<Problem | null> {
		const list = await this.load(projectId)
		const problem = list.find((p) => p.id === problemId)
		if (!problem) return null

		problem.resolved = false
		problem.resolvedAt = undefined
		problem.updatedAt = new Date().toISOString()

		await this.save(projectId, list)
		return problem
	}

	async deleteProblem(projectId: string, problemId: string): Promise<boolean> {
		const list = await this.load(projectId)
		const initialLen = list.length
		const updated = list.filter((p) => p.id !== problemId)
		if (updated.length !== initialLen) {
			await this.save(projectId, updated)
			return true
		}
		return false
	}

	async clearResolved(projectId: string): Promise<void> {
		const list = await this.load(projectId)
		const updated = list.filter((p) => !p.resolved)
		await this.save(projectId, updated)
	}

	async getSummary(projectId: string): Promise<ProblemSummary> {
		const list = await this.load(projectId)
		const active = list.filter((p) => !p.resolved)
		return {
			total: list.length,
			errors: active.filter((p) => p.severity === 'error').length,
			warnings: active.filter((p) => p.severity === 'warning').length,
			info: active.filter((p) => p.severity === 'info').length,
			active: active.length,
			resolved: list.filter((p) => p.resolved).length,
		}
	}

	// Parse TypeScript compiler output
	parseTypeScriptOutput(output: string, projectId: string): Problem[] {
		const problems: Problem[] = []
		const lines = output.split('\n')

		for (const line of lines) {
			const trimmed = line.trim()
			if (!trimmed) continue

			// Pattern 1: src/App.tsx(12,5): error TS2322: Type 'string' is not assignable to type 'number'.
			const match1 = trimmed.match(/^([^(]+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/i)
			if (match1) {
				const [, file, lineStr, colStr, severityStr, code, message] = match1
				problems.push({
					id: `ts_${file}_${lineStr}_${colStr}_${code}`,
					projectId,
					source: 'typescript',
					severity: severityStr.toLowerCase() === 'error' ? 'error' : 'warning',
					category: 'TypeScript',
					title: `${code}: ${message}`,
					message,
					file: file.trim(),
					line: parseInt(lineStr, 10),
					column: parseInt(colStr, 10),
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					resolved: false,
				})
				continue
			}

			// Pattern 2: src/App.tsx:12:5 - error TS2322: Type 'string' is not assignable to type 'number'.
			const match2 = trimmed.match(/^([^:]+):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s+(.+)$/i)
			if (match2) {
				const [, file, lineStr, colStr, severityStr, code, message] = match2
				problems.push({
					id: `ts_${file}_${lineStr}_${colStr}_${code}`,
					projectId,
					source: 'typescript',
					severity: severityStr.toLowerCase() === 'error' ? 'error' : 'warning',
					category: 'TypeScript',
					title: `${code}: ${message}`,
					message,
					file: file.trim(),
					line: parseInt(lineStr, 10),
					column: parseInt(colStr, 10),
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					resolved: false,
				})
			}
		}

		return problems
	}

	// Parse Oxlint / ESLint output
	parseLintOutput(output: string, projectId: string): Problem[] {
		const problems: Problem[] = []
		const lines = output.split('\n')

		for (const line of lines) {
			const trimmed = line.trim()
			if (!trimmed) continue

			// Pattern: src/foo.ts:10:5: error[eslint/rule]: description
			const match = trimmed.match(/^([^:]+):(\d+):(\d+):\s*(error|warning|info)(?:\[([^\]]+)\])?:\s*(.+)$/i)
			if (match) {
				const [, file, lineStr, colStr, sevStr, rule, message] = match
				const severity: ProblemSeverity =
					sevStr.toLowerCase() === 'error'
						? 'error'
						: sevStr.toLowerCase() === 'warning'
						? 'warning'
						: 'info'

				problems.push({
					id: `lint_${file}_${lineStr}_${colStr}_${rule || 'lint'}`,
					projectId,
					source: 'lint',
					severity,
					category: 'Lint',
					title: rule ? `[${rule}] ${message}` : message,
					message,
					file: file.trim(),
					line: parseInt(lineStr, 10),
					column: parseInt(colStr, 10),
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					resolved: false,
					metadata: rule ? { rule } : undefined,
				})
			}
		}

		return problems
	}

	async refresh(
		projectId: string,
		projectPath: string,
		githubToken?: string,
	): Promise<Problem[]> {
		const existingList = await this.load(projectId)
		const activeManualProblems = existingList.filter((p) => p.source === 'agent' || p.source === 'runtime' || p.source === 'terminal')

		const freshProblems: Problem[] = []

		// 1. Check Local Git Problems (Merge conflicts, broken states)
		try {
			const isRepo = await this.git.isRepo(projectPath)
			if (isRepo) {
				const conflicts = await this.git.getConflicts(projectPath)
				for (const conflict of conflicts) {
					freshProblems.push({
						id: `git_conflict_${conflict.path}`,
						projectId,
						source: 'merge_conflict',
						severity: 'error',
						category: 'Git Merge Conflict',
						title: `Merge conflict in ${conflict.path}`,
						message: `Both branches modified ${conflict.path}. File contains conflict markers (<<<<<<<, =======, >>>>>>>).`,
						file: conflict.path,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						resolved: false,
						metadata: { conflictStatus: conflict.status },
					})
				}

				const gitStatus = await this.git.status(projectPath)
				if (gitStatus.branch === 'HEAD' || gitStatus.branch === '(no branch)' || !gitStatus.branch) {
					freshProblems.push({
						id: 'git_detached_head',
						projectId,
						source: 'git',
						severity: 'warning',
						category: 'Git',
						title: 'Detached HEAD state',
						message: 'HEAD is currently detached. Any new commits will not belong to a branch.',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						resolved: false,
					})
				}
			}
		} catch (err) {
			console.error('ProblemService: Git check failed:', err)
		}

		// 2. Check TypeScript diagnostics (quick non-blocking tsc check)
		try {
			const { stdout, stderr } = await execAsync('npx tsc --noEmit --pretty false', {
				cwd: projectPath,
				timeout: 15000,
			}).catch((err) => {
				return { stdout: (err.stdout as string) || '', stderr: (err.stderr as string) || '' }
			})

			const tsOutput = stdout + '\n' + stderr
			if (tsOutput.includes('error TS')) {
				const tsProblems = this.parseTypeScriptOutput(tsOutput, projectId)
				freshProblems.push(...tsProblems)
			}
		} catch {
			// ignore tsc execution error
		}

		// 3. Check Lint diagnostics (quick oxlint / eslint)
		try {
			const { stdout, stderr } = await execAsync('npx oxlint', {
				cwd: projectPath,
				timeout: 10000,
			}).catch((err) => {
				return { stdout: (err.stdout as string) || '', stderr: (err.stderr as string) || '' }
			})

			const lintOutput = stdout + '\n' + stderr
			if (lintOutput.includes(': error') || lintOutput.includes(': warning')) {
				const lintProblems = this.parseLintOutput(lintOutput, projectId)
				freshProblems.push(...lintProblems)
			}
		} catch {
			// ignore lint execution error
		}

		// 4. Check GitHub issues if token and remote available
		if (githubToken) {
			try {
				const ghClient = new GitHubRestClient(githubToken)
				const status = await this.git.status(projectPath)
				const currentBranch = status.branch || 'main'

				// Get remote URL to find owner & repo
				const remotes = await this.git.getAuthenticatedRemoteUrl(projectPath, 'origin', githubToken)
				if (remotes) {
					const ghMatch = remotes.match(/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i)
					if (ghMatch) {
						const owner = ghMatch[1]
						const repo = ghMatch[2]

						// Check Open PRs
						const prs = await ghClient.listPullRequests(owner, repo, 'open', 10)
						for (const pr of prs) {
							if (pr.mergeable === false) {
								freshProblems.push({
									id: `gh_pr_conflict_${pr.number}`,
									projectId,
									source: 'pull_request',
									severity: 'error',
									category: 'GitHub Pull Request',
									title: `PR #${pr.number} cannot be merged — conflicts with ${pr.base.ref}`,
									message: `PR #${pr.number} "${pr.title}" has unresolved merge conflicts with base branch ${pr.base.ref}.`,
									gitBranch: pr.head.ref,
									pullRequestNumber: pr.number,
									createdAt: pr.created_at,
									updatedAt: new Date().toISOString(),
									resolved: false,
									metadata: { prUrl: pr.html_url },
								})
							}

							// Check Reviews for requested changes
							const reviews = await ghClient.listPullRequestReviews(owner, repo, pr.number).catch(() => [])
							const hasChangesRequested = reviews.some((r) => r.state === 'CHANGES_REQUESTED')
							if (hasChangesRequested) {
								freshProblems.push({
									id: `gh_pr_changes_requested_${pr.number}`,
									projectId,
									source: 'pull_request',
									severity: 'warning',
									category: 'GitHub Review',
									title: `Changes requested on PR #${pr.number}`,
									message: `Reviewers requested changes on PR #${pr.number} "${pr.title}".`,
									gitBranch: pr.head.ref,
									pullRequestNumber: pr.number,
									createdAt: new Date().toISOString(),
									updatedAt: new Date().toISOString(),
									resolved: false,
									metadata: { prUrl: pr.html_url },
								})
							}
						}

						// Check Workflow Runs on current branch
						const runs = await ghClient.listWorkflowRuns(owner, repo, 10).catch(() => [])
						const failedRuns = runs.filter(
							(r) =>
								(r.headBranch === currentBranch || r.headBranch === 'main') &&
								r.status === 'completed' &&
								r.conclusion === 'failure',
						)

						for (const run of failedRuns.slice(0, 3)) {
							freshProblems.push({
								id: `gh_workflow_failed_${run.id}`,
								projectId,
								source: 'deployment',
								severity: 'error',
								category: 'GitHub Actions',
								title: `${run.name || 'Workflow'} — failed`,
								message: `Workflow run #${run.runNumber || run.id} on branch ${run.headBranch} failed.`,
								gitBranch: run.headBranch,
								createdAt: run.createdAt,
								updatedAt: new Date().toISOString(),
								resolved: false,
								metadata: { runUrl: run.htmlUrl },
							})
						}

						// Check Pages deployment
						const pages = await ghClient.getPagesStatus(owner, repo).catch(() => null)
						if (pages && pages.status === 'errored') {
							freshProblems.push({
								id: 'gh_pages_failed',
								projectId,
								source: 'deployment',
								severity: 'error',
								category: 'GitHub Pages',
								title: 'Deploy to GitHub Pages — failed',
								message: 'GitHub Pages build or deployment encountered an error.',
								createdAt: new Date().toISOString(),
								updatedAt: new Date().toISOString(),
								resolved: false,
								metadata: { pagesUrl: pages.htmlUrl },
							})
						}
					}
				}
			} catch (err) {
				console.error('ProblemService: GitHub check failed:', err)
			}
		}

		// Merge fresh automated problems with active manual problems
		const combined = [...freshProblems]

		for (const manual of activeManualProblems) {
			if (!combined.some((p) => p.id === manual.id)) {
				combined.push(manual)
			}
		}

		await this.save(projectId, combined)
		return combined
	}
}

