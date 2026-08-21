import { Router } from 'express'
import { asyncHandler } from '../middleware.js'
import type { AgyService, PermissionQueue } from '../services/agyService.js'
import type { ProjectService } from '../services/projectService.js'
import { SessionStore } from '../store.js'
import { param } from '../utils/params.js'
import type { AgentMode } from '../types/agent.js'

export function createAgentRouter(
	projects: ProjectService,
	agy: AgyService,
	sessions: SessionStore,
	permissions: PermissionQueue,
): Router {
	const router = Router()

	router.get(
		'/session/:projectId',
		asyncHandler(async (req, res) => {
			const session = await sessions.getOrCreate(param(req, 'projectId'))
			res.json(session)
		}),
	)

	router.post(
		'/message',
		asyncHandler(async (req, res) => {
			const { projectId, content, mode = 'agent' } = req.body as {
				projectId: string
				content: string
				mode?: AgentMode
			}

			if (!projectId || !content?.trim()) {
				res.status(400).json({ error: 'projectId and content are required' })
				return
			}

			const projectPath = await projects.getPath(projectId)
			if (!projectPath) {
				res.status(404).json({ error: 'Project not found' })
				return
			}

			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			})

			const send = (event: string, data: unknown) => {
				res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
			}

			try {
				await agy.runPrompt(projectPath, projectId, content.trim(), mode, (streamEvent) => {
					send('stream', streamEvent)
				})
			} catch (error) {
				send('stream', {
					type: 'error',
					message: error instanceof Error ? error.message : 'Agent failed',
				})
			}

			res.end()
		}),
	)

	router.get(
		'/permissions',
		asyncHandler(async (req, res) => {
			const projectId = req.query.projectId as string | undefined
			res.json(permissions.getPending(projectId))
		}),
	)

	router.post(
		'/permissions/:id/approve',
		asyncHandler(async (req, res) => {
			const result = permissions.respond(param(req, 'id'), true)
			if (!result) {
				res.status(404).json({ error: 'Permission request not found' })
				return
			}
			res.json(result)
		}),
	)

	router.post(
		'/permissions/:id/deny',
		asyncHandler(async (req, res) => {
			const result = permissions.respond(param(req, 'id'), false)
			if (!result) {
				res.status(404).json({ error: 'Permission request not found' })
				return
			}
			res.json(result)
		}),
	)

	router.post(
		'/session/:projectId/reset',
		asyncHandler(async (req, res) => {
			const session = await sessions.getOrCreate(param(req, 'projectId'))
			session.conversationId = null
			session.items = []
			session.updatedAt = new Date().toISOString()
			await sessions.save(session)
			res.json(session)
		}),
	)

	return router
}

export function createRunRouter(projects: ProjectService): Router {
	const router = Router()

	router.post(
		'/',
		asyncHandler(async (req, res) => {
			const { projectId, command } = req.body as { projectId: string; command: string }
			if (!projectId || !command) {
				res.status(400).json({ error: 'projectId and command are required' })
				return
			}

			const projectPath = await projects.getPath(projectId)
			if (!projectPath) {
				res.status(404).json({ error: 'Project not found' })
				return
			}

			const { runProjectCommand } = await import('../services/gitService.js')
			const start = Date.now()
			const result = await runProjectCommand(projectPath, command)
			res.json({ ...result, durationMs: Date.now() - start })
		}),
	)

	return router
}
