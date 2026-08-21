import { Router } from 'express'
import { simpleGit } from 'simple-git'
import type { ServerConfig } from '../config.js'
import { asyncHandler } from '../middleware.js'
import type { ProjectService } from '../services/projectService.js'
import { GitHubService } from '../services/githubService.js'
import { param, queryParam } from '../utils/params.js'
import type { GitHubPullRequestState } from '../types/github.js'

export function createGitHubRouter(projects: ProjectService, config: ServerConfig): Router {
	const router = Router()
	const github = new GitHubService(config)

	async function getProjectContext(projectId: string) {
		const projectPath = await projects.getPath(projectId)
		if (!projectPath) throw new Error('Project not found')

		let remoteUrl: string | undefined
		try {
			const remotes = await simpleGit({ baseDir: projectPath }).getRemotes(true)
			remoteUrl = remotes.find((r) => r.name === 'origin')?.refs.fetch
		} catch {
			// no remote
		}

		const repoInfo = await github.getRepoInfo(projectPath, remoteUrl)
		return { projectPath, repoInfo, remoteUrl }
	}

	router.get('/auth', asyncHandler(async (_req, res) => {
		res.json(await github.authStatus())
	}))

	router.get('/:projectId/repo', asyncHandler(async (req, res) => {
		const { projectPath, remoteUrl } = await getProjectContext(param(req, 'projectId'))
		const details = await github.getRepoDetails(projectPath, remoteUrl)
		if (!details) {
			const info = await github.getRepoInfo(projectPath, remoteUrl)
			res.json(info)
			return
		}
		res.json(details)
	}))

	router.post('/:projectId/repo', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		const body = req.body as { name: string; description?: string; private?: boolean; push?: boolean }
		res.json(await github.createRepo(body, projectPath))
	}))

	router.post('/:projectId/repo/link-remote', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		await github.linkRemote(projectPath, req.body)
		res.json({ ok: true })
	}))

	router.patch('/:projectId/repo', asyncHandler(async (req, res) => {
		const { projectPath, repoInfo } = await getProjectContext(param(req, 'projectId'))
		if (!repoInfo) {
			res.status(400).json({ error: 'No GitHub repository linked' })
			return
		}
		await github.updateRepo(projectPath, repoInfo, req.body)
		res.json({ ok: true })
	}))

	router.delete('/:projectId/repo', asyncHandler(async (req, res) => {
		const { repoInfo } = await getProjectContext(param(req, 'projectId'))
		if (!repoInfo) {
			res.status(400).json({ error: 'No GitHub repository linked' })
			return
		}
		await github.deleteRepo(repoInfo, req.body)
		res.json({ ok: true })
	}))

	router.get('/:projectId/prs', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		const state = (queryParam(req, 'state') ?? 'open') as GitHubPullRequestState
		const limit = Number.parseInt(queryParam(req, 'limit') ?? '50', 10)
		res.json(await github.listPullRequests(projectPath, state, limit))
	}))

	router.get('/:projectId/prs/:number', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		const number = Number.parseInt(param(req, 'number'), 10)
		res.json(await github.getPullRequest(projectPath, number))
	}))

	router.post('/:projectId/prs', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		res.json(await github.createPullRequest(projectPath, req.body))
	}))

	router.patch('/:projectId/prs/:number', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		const number = Number.parseInt(param(req, 'number'), 10)
		await github.updatePullRequest(projectPath, { ...req.body, number })
		res.json({ ok: true })
	}))

	router.post('/:projectId/prs/merge', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		await github.mergePullRequest(projectPath, req.body)
		res.json({ ok: true })
	}))

	router.post('/:projectId/prs/close', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		await github.closePullRequest(projectPath, req.body)
		res.json({ ok: true })
	}))

	router.post('/:projectId/prs/:number/reopen', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		const number = Number.parseInt(param(req, 'number'), 10)
		await github.reopenPullRequest(projectPath, number)
		res.json({ ok: true })
	}))

	return router
}
