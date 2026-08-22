import { Router } from 'express'
import { asyncHandler } from '../middleware.js'
import type { ProjectService } from '../services/projectService.js'
import type { ArtifactService } from '../services/artifactService.js'
import { param } from '../utils/params.js'
import type {
	CreateArtifactRequest,
	ImportArtifactFromRepoRequest,
	SaveArtifactToRepoRequest,
	UpdateArtifactRequest,
} from '../types/artifact.js'

export function createArtifactsRouter(
	projects: ProjectService,
	artifacts: ArtifactService,
): Router {
	const router = Router()

	async function pathFor(id: string): Promise<string> {
		const path = await projects.getPath(id)
		if (!path) throw new Error('Project not found')
		return path
	}

	router.get(
		'/:projectId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const list = await artifacts.list(projectId)
			res.json(list)
		}),
	)

	router.post(
		'/:projectId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const body = req.body as CreateArtifactRequest
			if (!body.title?.trim() && !body.content?.trim()) {
				res.status(400).json({ error: 'Title or content is required' })
				return
			}
			const created = await artifacts.create(projectId, body)
			res.status(201).json(created)
		}),
	)

	router.get(
		'/:projectId/:id',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const id = param(req, 'id')
			const item = await artifacts.get(projectId, id)
			if (!item) {
				res.status(404).json({ error: 'Artifact not found' })
				return
			}
			res.json(item)
		}),
	)

	router.put(
		'/:projectId/:id',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const id = param(req, 'id')
			const body = req.body as UpdateArtifactRequest
			const updated = await artifacts.update(projectId, id, body)
			if (!updated) {
				res.status(404).json({ error: 'Artifact not found' })
				return
			}
			res.json(updated)
		}),
	)

	router.delete(
		'/:projectId/:id',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const id = param(req, 'id')
			const deleted = await artifacts.delete(projectId, id)
			res.json({ ok: deleted })
		}),
	)

	router.post(
		'/:projectId/:id/save-to-repo',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const id = param(req, 'id')
			const { targetPath } = req.body as SaveArtifactToRepoRequest
			if (!targetPath?.trim()) {
				res.status(400).json({ error: 'targetPath is required' })
				return
			}
			const projectPath = await pathFor(projectId)
			const result = await artifacts.saveToRepo(projectPath, projectId, id, targetPath.trim())
			res.json(result)
		}),
	)

	router.post(
		'/:projectId/import-from-repo',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const { sourcePath, title } = req.body as ImportArtifactFromRepoRequest
			if (!sourcePath?.trim()) {
				res.status(400).json({ error: 'sourcePath is required' })
				return
			}
			const projectPath = await pathFor(projectId)
			const created = await artifacts.importFromRepo(
				projectPath,
				projectId,
				sourcePath.trim(),
				title,
			)
			res.status(201).json(created)
		}),
	)

	return router
}
