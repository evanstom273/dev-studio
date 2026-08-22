import { Router } from 'express'
import { join } from 'node:path'
import type { ServerConfig } from '../config.js'
import { asyncHandler } from '../middleware.js'
import { param } from '../utils/params.js'
import type { ProjectService } from '../services/projectService.js'
import { resolveGitHubToken } from '../utils/githubToken.js'

export function createProjectsRouter(projects: ProjectService, config: ServerConfig): Router {
	const router = Router()

	router.get(
		'/',
		asyncHandler(async (_req, res) => {
			res.json(await projects.list())
		}),
	)

	router.post(
		'/open-github',
		asyncHandler(async (req, res) => {
			const { owner, repo } = req.body as { owner: string; repo: string }
			if (!owner || !repo) {
				res.status(400).json({ error: 'owner and repo are required' })
				return
			}
			const token = resolveGitHubToken(req, config)
			res.json(await projects.openFromGitHub(owner, repo, token))
		}),
	)

	router.post(
		'/create-github',
		asyncHandler(async (req, res) => {
			const { name, description, private: isPrivate } = req.body as {
				name: string
				description?: string
				private?: boolean
			}
			if (!name) {
				res.status(400).json({ error: 'name is required' })
				return
			}
			const token = resolveGitHubToken(req, config)
			res.json(await projects.createAndOpen(name, token, description, isPrivate))
		}),
	)

	router.get(
		'/browse',
		asyncHandler(async (req, res) => {
			const path = typeof req.query.path === 'string' ? req.query.path : undefined
			res.json(await projects.browseDirectory(path))
		}),
	)

	router.post(
		'/open-local',
		asyncHandler(async (req, res) => {
			const { path, name } = req.body as { path: string; name?: string }
			if (!path) {
				res.status(400).json({ error: 'path is required' })
				return
			}
			res.json(await projects.openLocalFolder(path, name))
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

	router.post(
		'/:id/remove-local',
		asyncHandler(async (req, res) => {
			await projects.removeLocalCopy(param(req, 'id'))
			res.json({ ok: true })
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
