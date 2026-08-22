import { Router } from 'express'
import type { IncomingMessage } from 'node:http'
import type { WebSocket, WebSocketServer } from 'ws'
import { asyncHandler } from '../middleware.js'
import type { ServerConfig } from '../config.js'
import type { ProjectService } from '../services/projectService.js'
import type { TerminalSessionManager } from '../services/terminalService.js'
import { param } from '../utils/params.js'
import type {
	CreateTerminalSessionRequest,
	TerminalClientMessage,
	TerminalServerMessage,
} from '../types/terminal.js'

export function createTerminalRouter(
	projects: ProjectService,
	terminal: TerminalSessionManager,
): Router {
	const router = Router()

	async function pathFor(id: string): Promise<string> {
		const path = await projects.getPath(id)
		if (!path) throw new Error('Project not found')
		return path
	}

	router.get(
		'/:projectId/sessions',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const sessions = terminal.listSessions(projectId)
			res.json(sessions)
		}),
	)

	router.post(
		'/:projectId/sessions',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const projectPath = await pathFor(projectId)
			const session = terminal.createSession(
				projectId,
				projectPath,
				req.body as CreateTerminalSessionRequest,
			)
			res.status(201).json(session)
		}),
	)

	router.post(
		'/:projectId/sessions/default',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const projectPath = await pathFor(projectId)
			const session = terminal.getOrCreateDefaultSession(projectId, projectPath)
			res.json(session)
		}),
	)

	router.delete(
		'/:projectId/sessions/:sessionId',
		asyncHandler(async (req, res) => {
			const sessionId = param(req, 'sessionId')
			const killed = terminal.killSession(sessionId)
			res.json({ ok: killed })
		}),
	)

	router.patch(
		'/:projectId/sessions/:sessionId',
		asyncHandler(async (req, res) => {
			const sessionId = param(req, 'sessionId')
			const { title } = req.body as { title: string }
			const updated = terminal.renameSession(sessionId, title)
			if (!updated) {
				res.status(404).json({ error: 'Session not found' })
				return
			}
			res.json(updated)
		}),
	)

	return router
}

export function setupTerminalWebSocket(
	wss: WebSocketServer,
	terminal: TerminalSessionManager,
	config: ServerConfig,
): void {
	wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
		const url = new URL(req.url ?? '', `http://${req.headers.host || 'localhost'}`)
		const sessionId = url.searchParams.get('sessionId')
		const token = url.searchParams.get('token')

		if (config.token && token !== config.token) {
			const authHeader = req.headers.authorization
			const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
			if (bearer !== config.token) {
				ws.send(
					JSON.stringify({
						type: 'error',
						message: 'Unauthorized WebSocket connection',
					} satisfies TerminalServerMessage),
				)
				ws.close(4401, 'Unauthorized')
				return
			}
		}

		if (!sessionId) {
			ws.send(
				JSON.stringify({
					type: 'error',
					message: 'sessionId is required in query params',
				} satisfies TerminalServerMessage),
			)
			ws.close(4400, 'Missing sessionId')
			return
		}

		const added = terminal.addClient(sessionId, ws)
		if (!added) {
			ws.send(
				JSON.stringify({
					type: 'error',
					message: 'Terminal session not found or already closed',
				} satisfies TerminalServerMessage),
			)
			ws.close(4404, 'Session not found')
			return
		}

		ws.on('message', (data: Buffer | string) => {
			try {
				const parsed = JSON.parse(data.toString()) as TerminalClientMessage
				terminal.handleMessage(sessionId, parsed)
			} catch {
				// invalid message format
			}
		})

		ws.on('close', () => {
			terminal.removeClient(sessionId, ws)
		})

		ws.on('error', () => {
			terminal.removeClient(sessionId, ws)
		})
	})
}
