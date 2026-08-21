import { Router } from 'express'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { asyncHandler } from '../middleware.js'
import type { ServerConfig } from '../config.js'
import type { AgyService, PermissionQueue } from '../services/agyService.js'
import type { ProjectService } from '../services/projectService.js'
import { SessionStore } from '../store.js'
import { param } from '../utils/params.js'
import { resolveGitHubToken } from '../utils/githubToken.js'
import type { AgentMode, AttachmentInfo } from '../types/agent.js'

export function createAgentRouter(
	projects: ProjectService,
	agy: AgyService,
	sessions: SessionStore,
	permissions: PermissionQueue,
	config: ServerConfig,
): Router {
	const router = Router()

	router.get(
		'/models',
		asyncHandler(async (_req, res) => {
			const models = await agy.getAvailableModels()
			res.json({ models })
		}),
	)

	router.post(
		'/stop',
		asyncHandler(async (req, res) => {
			const { projectId } = req.body as { projectId: string }
			if (!projectId) {
				res.status(400).json({ error: 'projectId is required' })
				return
			}
			const stopped = agy.stopTurn(projectId)
			res.json({ stopped })
		}),
	)

	router.post(
		'/upload',
		asyncHandler(async (req, res) => {
			const { projectId, filename, contentType, base64 } = req.body as {
				projectId: string
				filename: string
				contentType: string
				base64: string
			}

			if (!projectId || !filename || !base64) {
				res.status(400).json({ error: 'projectId, filename, and base64 are required' })
				return
			}

			let projectPath: string
			try {
				const token = resolveGitHubToken(req, config)
				projectPath = (await projects.ensureAgentWorkspace(projectId, token)).path
			} catch (error) {
				res.status(404).json({
					error: error instanceof Error ? error.message : 'Project not found',
				})
				return
			}

			const attachmentsDir = join(projectPath, '.dev-studio', 'attachments')
			await mkdir(attachmentsDir, { recursive: true })

			const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
			const targetFilename = `${Date.now()}_${safeName}`
			const targetPath = join(attachmentsDir, targetFilename)

			const buffer = Buffer.from(base64, 'base64')
			await writeFile(targetPath, buffer)

			const relativePath = `.dev-studio/attachments/${targetFilename}`
			res.json({
				filename: safeName,
				relativePath,
				size: buffer.length,
				contentType: contentType || 'application/octet-stream',
			})
		}),
	)

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
			const {
				projectId,
				content,
				mode = 'agent',
				model,
				attachments = [],
			} = req.body as {
				projectId: string
				content: string
				mode?: AgentMode
				model?: string
				attachments?: AttachmentInfo[]
			}

			if (!projectId || (!content?.trim() && attachments.length === 0)) {
				res.status(400).json({ error: 'projectId and content/attachments are required' })
				return
			}

			let projectPath: string
			try {
				const token = resolveGitHubToken(req, config)
				projectPath = (await projects.ensureAgentWorkspace(projectId, token)).path
			} catch (error) {
				res.status(404).json({
					error: error instanceof Error ? error.message : 'Project not found',
				})
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

			const onPermission = (permission: unknown) => {
				send('stream', { type: 'permission_request', permission })
			}
			permissions.on('permission', onPermission)

			try {
				await agy.runPrompt(
					projectPath,
					projectId,
					content.trim(),
					mode,
					model,
					(streamEvent) => {
						send('stream', streamEvent)
					},
				)
			} catch (error) {
				send('stream', {
					type: 'error',
					message: error instanceof Error ? error.message : 'Agent failed',
				})
			} finally {
				permissions.off('permission', onPermission)
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
			const projectId = param(req, 'projectId')
			agy.resetProjectSession(projectId)
			const session = await sessions.getOrCreate(projectId)
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
