import { Router } from 'express'
import { asyncHandler } from '../middleware.js'
import type { ServerConfig } from '../config.js'
import type { ProjectService } from '../services/projectService.js'
import { FileService, GitService } from '../services/gitService.js'
import { param, queryParam } from '../utils/params.js'
import { resolveGitHubToken } from '../utils/githubToken.js'

export function createGitRouter(projects: ProjectService, config: ServerConfig): Router {
	const router = Router()
	const git = new GitService()

	async function pathFor(id: string): Promise<string> {
		const path = await projects.getPath(id)
		if (!path) throw new Error('Project not found')
		return path
	}

	router.get('/:projectId/status', asyncHandler(async (req, res) => {
		res.json(await git.status(await pathFor(param(req, 'projectId'))))
	}))

	router.get('/:projectId/diff', asyncHandler(async (req, res) => {
		const filePath = queryParam(req, 'path')
		const staged = queryParam(req, 'staged') === 'true'
		res.json(await git.diff(await pathFor(param(req, 'projectId')), filePath, staged))
	}))

	router.get('/:projectId/log', asyncHandler(async (req, res) => {
		const limit = Number.parseInt(queryParam(req, 'limit') ?? '30', 10)
		res.json(await git.log(await pathFor(param(req, 'projectId')), limit))
	}))

	router.get('/:projectId/branches', asyncHandler(async (req, res) => {
		res.json(await git.branches(await pathFor(param(req, 'projectId'))))
	}))

	router.get('/:projectId/conflicts', asyncHandler(async (req, res) => {
		res.json(await git.getConflicts(await pathFor(param(req, 'projectId'))))
	}))

	router.post('/:projectId/stage', asyncHandler(async (req, res) => {
		const { paths } = req.body as { paths: string[] }
		await git.stage(await pathFor(param(req, 'projectId')), paths)
		res.json({ ok: true })
	}))

	router.post('/:projectId/stage-all', asyncHandler(async (req, res) => {
		await git.stageAll(await pathFor(param(req, 'projectId')))
		res.json({ ok: true })
	}))

	router.post('/:projectId/unstage', asyncHandler(async (req, res) => {
		const { paths } = req.body as { paths: string[] }
		await git.unstage(await pathFor(param(req, 'projectId')), paths)
		res.json({ ok: true })
	}))

	router.post('/:projectId/unstage-all', asyncHandler(async (req, res) => {
		await git.unstageAll(await pathFor(param(req, 'projectId')))
		res.json({ ok: true })
	}))

	router.post('/:projectId/commit', asyncHandler(async (req, res) => {
		const { message } = req.body as { message: string }
		if (!message?.trim()) {
			res.status(400).json({ error: 'Commit message is required' })
			return
		}
		const hash = await git.commit(await pathFor(param(req, 'projectId')), message.trim())
		res.json({ hash })
	}))

	router.post('/:projectId/fetch', asyncHandler(async (req, res) => {
		const { remote = 'origin' } = req.body as { remote?: string }
		const token = resolveGitHubToken(req, config)
		await git.fetch(await pathFor(param(req, 'projectId')), remote, token)
		res.json({ ok: true })
	}))

	router.post('/:projectId/pull', asyncHandler(async (req, res) => {
		const { remote = 'origin', branch, rebase = false } = req.body as {
			remote?: string
			branch?: string
			rebase?: boolean
		}
		const token = resolveGitHubToken(req, config)
		await git.pull(await pathFor(param(req, 'projectId')), remote, branch, rebase, token)
		res.json({ ok: true })
	}))

	router.post('/:projectId/push', asyncHandler(async (req, res) => {
		const { remote = 'origin', branch, force = false } = req.body as {
			remote?: string
			branch?: string
			force?: boolean
		}
		const token = resolveGitHubToken(req, config)
		await git.push(await pathFor(param(req, 'projectId')), remote, branch, force, token)
		res.json({ ok: true })
	}))

	router.post('/:projectId/checkout', asyncHandler(async (req, res) => {
		const { name, create = false } = req.body as { name: string; create?: boolean }
		if (!name?.trim()) {
			res.status(400).json({ error: 'Branch name is required' })
			return
		}
		await git.checkout(await pathFor(param(req, 'projectId')), name.trim(), create)
		res.json({ ok: true })
	}))

	router.post('/:projectId/merge', asyncHandler(async (req, res) => {
		const { branch } = req.body as { branch: string }
		const result = await git.merge(await pathFor(param(req, 'projectId')), branch)
		res.json(result)
	}))

	router.post('/:projectId/discard', asyncHandler(async (req, res) => {
		const { paths } = req.body as { paths: string[] }
		await git.discard(await pathFor(param(req, 'projectId')), paths)
		res.json({ ok: true })
	}))

	router.post('/:projectId/revert', asyncHandler(async (req, res) => {
		const { commitHash } = req.body as { commitHash: string }
		await git.revert(await pathFor(param(req, 'projectId')), commitHash)
		res.json({ ok: true })
	}))

	router.post('/:projectId/remote', asyncHandler(async (req, res) => {
		const { name, url } = req.body as { name: string; url: string }
		await git.addRemote(await pathFor(param(req, 'projectId')), name, url)
		res.json({ ok: true })
	}))

	return router
}

export function createFilesRouter(projects: ProjectService): Router {
	const router = Router()
	const files = new FileService()

	router.get('/:projectId/tree', asyncHandler(async (req, res) => {
		const path = await projects.getPath(param(req, 'projectId'))
		if (!path) {
			res.status(404).json({ error: 'Project not found' })
			return
		}
		res.json(await files.tree(path))
	}))

	router.get('/:projectId/content', asyncHandler(async (req, res) => {
		const filePath = queryParam(req, 'path')
		if (!filePath) {
			res.status(400).json({ error: 'path query param required' })
			return
		}
		const projectPath = await projects.getPath(param(req, 'projectId'))
		if (!projectPath) {
			res.status(404).json({ error: 'Project not found' })
			return
		}
		const content = await files.read(projectPath, filePath)
		if (content === null) {
			res.status(404).json({ error: 'File not found' })
			return
		}
		res.json({ path: filePath, content })
	}))

	router.post('/:projectId/content', asyncHandler(async (req, res) => {
		const { path: filePath, content } = req.body as { path: string; content: string }
		if (!filePath || content === undefined) {
			res.status(400).json({ error: 'path and content are required' })
			return
		}
		const projectPath = await projects.getPath(param(req, 'projectId'))
		if (!projectPath) {
			res.status(404).json({ error: 'Project not found' })
			return
		}
		await files.write(projectPath, filePath, content)
		res.json({ ok: true, path: filePath })
	}))

	return router
}
