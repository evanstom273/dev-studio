import { Router } from 'express'
import { asyncHandler } from '../middleware.js'
import type { ProcessService } from '../services/processService.js'
import type { ProjectService } from '../services/projectService.js'
import { param } from '../utils/params.js'
import { resolveGitHubToken } from '../utils/githubToken.js'
import type { ServerConfig } from '../config.js'
import type { StartProcessRequest } from '../types/process.js'

export function createProcessesRouter(
	projects: ProjectService,
	processes: ProcessService,
	config: ServerConfig,
): Router {
	const router = Router()

	router.get(
		'/:projectId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const token = resolveGitHubToken(req, config)
			const project = await projects.ensureAgentWorkspace(projectId, token)
			const showAll = req.query.all === 'true'

			const result = await processes.listProcesses(projectId, project.path, showAll)
			res.json(result)
		}),
	)

	router.post(
		'/:projectId/start',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const token = resolveGitHubToken(req, config)
			const project = await projects.ensureAgentWorkspace(projectId, token)
			const body = req.body as StartProcessRequest

			const result = await processes.startProcess(projectId, project.path, body)
			res.json(result)
		}),
	)

	router.post(
		'/:projectId/:pid/stop',
		asyncHandler(async (req, res) => {
			const pid = parseInt(param(req, 'pid'), 10)
			const { force, acknowledgeBackend } = req.body as { force?: boolean; acknowledgeBackend?: boolean }

			const result = await processes.stopProcess(pid, { force, acknowledgeBackend })
			if (!result.success && result.message?.includes('PROTECTED')) {
				res.status(403).json(result)
				return
			}
			res.json(result)
		}),
	)

	router.post(
		'/:projectId/:pid/restart',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const pid = parseInt(param(req, 'pid'), 10)
			const token = resolveGitHubToken(req, config)
			const project = await projects.ensureAgentWorkspace(projectId, token)

			const result = await processes.restartProcess(pid, projectId, project.path)
			res.json(result)
		}),
	)

	router.post(
		'/:projectId/:pid/kill',
		asyncHandler(async (req, res) => {
			const pid = parseInt(param(req, 'pid'), 10)
			const { acknowledgeBackend } = req.body as { acknowledgeBackend?: boolean }

			const result = await processes.stopProcess(pid, { force: true, acknowledgeBackend })
			if (!result.success && result.message?.includes('PROTECTED')) {
				res.status(403).json(result)
				return
			}
			res.json(result)
		}),
	)

	return router
}

