import { Router } from 'express'
import { asyncHandler } from '../middleware.js'
import type { ProblemService } from '../services/problemService.js'
import type { ProjectService } from '../services/projectService.js'
import { param } from '../utils/params.js'
import { resolveGitHubToken } from '../utils/githubToken.js'
import type { ServerConfig } from '../config.js'
import type { Problem, ProblemFilter } from '../types/problem.js'

export function createProblemsRouter(
	projects: ProjectService,
	problems: ProblemService,
	config: ServerConfig,
): Router {
	const router = Router()

	router.get(
		'/:projectId/summary',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const summary = await problems.getSummary(projectId)
			res.json(summary)
		}),
	)

	router.get(
		'/:projectId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const filter: ProblemFilter = {
				status: req.query.status as ProblemFilter['status'],
				severity: req.query.severity as ProblemFilter['severity'],
				source: req.query.source as string,
				search: req.query.search as string,
			}
			const list = await problems.list(projectId, filter)
			res.json(list)
		}),
	)

	router.get(
		'/:projectId/:problemId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const problemId = param(req, 'problemId')
			const item = await problems.get(projectId, problemId)
			if (!item) {
				res.status(404).json({ error: 'Problem not found' })
				return
			}
			res.json(item)
		}),
	)

	router.post(
		'/:projectId/refresh',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const token = resolveGitHubToken(req, config)
			const project = await projects.ensureAgentWorkspace(projectId, token)

			const list = await problems.refresh(projectId, project.path, token)
			res.json(list)
		}),
	)

	router.post(
		'/:projectId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const body = req.body as Problem
			const created = await problems.addProblem(projectId, body)
			res.status(201).json(created)
		}),
	)

	router.post(
		'/:projectId/:problemId/resolve',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const problemId = param(req, 'problemId')
			const resolved = await problems.resolveProblem(projectId, problemId)
			if (!resolved) {
				res.status(404).json({ error: 'Problem not found' })
				return
			}
			res.json(resolved)
		}),
	)

	router.post(
		'/:projectId/:problemId/reopen',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const problemId = param(req, 'problemId')
			const reopened = await problems.reopenProblem(projectId, problemId)
			if (!reopened) {
				res.status(404).json({ error: 'Problem not found' })
				return
			}
			res.json(reopened)
		}),
	)

	router.delete(
		'/:projectId/resolved',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			await problems.clearResolved(projectId)
			res.json({ success: true })
		}),
	)

	router.delete(
		'/:projectId/:problemId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const problemId = param(req, 'problemId')
			const deleted = await problems.deleteProblem(projectId, problemId)
			res.json({ success: deleted })
		}),
	)

	return router
}

