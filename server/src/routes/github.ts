import { Router } from 'express'
import { simpleGit } from 'simple-git'
import { asyncHandler } from '../middleware.js'
import type { ProjectService } from '../services/projectService.js'
import { GitHubService } from '../services/githubService.js'
import { param } from '../utils/params.js'

export function createGitHubRouter(projects: ProjectService): Router {
	const router = Router()
	const github = new GitHubService()

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
		const { repoInfo } = await getProjectContext(param(req, 'projectId'))
		res.json(repoInfo)
	}))

	router.post('/:projectId/repo', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		const body = req.body as { name: string; description?: string; private?: boolean }
		res.json(await github.createRepo(body, projectPath))
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
		res.json(await github.listPullRequests(projectPath))
	}))

	router.post('/:projectId/prs', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		res.json(await github.createPullRequest(projectPath, req.body))
	}))

	router.post('/:projectId/prs/merge', asyncHandler(async (req, res) => {
		const { projectPath } = await getProjectContext(param(req, 'projectId'))
		await github.mergePullRequest(projectPath, req.body)
		res.json({ ok: true })
	}))

	return router
}
