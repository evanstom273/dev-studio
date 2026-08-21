import { Router } from 'express'
import { join } from 'node:path'
import { asyncHandler } from '../middleware.js'
import { param } from '../utils/params.js'
import type { ProjectService } from '../services/projectService.js'

export function createProjectsRouter(projects: ProjectService): Router {
	const router = Router()

	router.get(
		'/',
		asyncHandler(async (_req, res) => {
			res.json(await projects.list())
		}),
	)

	router.post(
		'/register',
		asyncHandler(async (req, res) => {
			const { path, name } = req.body as { path: string; name?: string }
			if (!path) {
				res.status(400).json({ error: 'path is required' })
				return
			}
			res.json(await projects.register(path, name))
		}),
	)

	router.post(
		'/init',
		asyncHandler(async (req, res) => {
			const { path, name } = req.body as { path: string; name?: string }
			if (!path) {
				res.status(400).json({ error: 'path is required' })
				return
			}
			res.json(await projects.initRepo(path, name))
		}),
	)

	router.post(
		'/clone',
		asyncHandler(async (req, res) => {
			const { url, path, name } = req.body as { url: string; path?: string; name?: string }
			if (!url) {
				res.status(400).json({ error: 'url is required' })
				return
			}
			const repoName = name ?? url.split('/').pop()?.replace('.git', '') ?? 'repo'
			const targetPath = path ?? join(process.env.DEV_STUDIO_PROJECTS_ROOT ?? '', repoName)
			res.json(await projects.clone(url, targetPath, name))
		}),
	)

	router.delete(
		'/:id',
		asyncHandler(async (req, res) => {
			await projects.unregister(param(req, 'id'))
			res.json({ ok: true })
		}),
	)

	return router
}
