import { Router } from 'express'
import type { IncomingMessage } from 'node:http'
import type { WebSocket, WebSocketServer } from 'ws'
import { asyncHandler } from '../middleware.js'
import type { ServerConfig } from '../config.js'
import type { BrowserService } from '../services/browserService.js'
import { param } from '../utils/params.js'
import type {
	BrowserClientMessage,
	BrowserServerMessage,
	BrowserViewport,
	CreateTabRequest,
	FindOnPageRequest,
	NavigateRequest,
	TabActionRequest,
} from '../types/browser.js'

export function createBrowserRouter(browser: BrowserService): Router {
	const router = Router()

	router.get(
		'/state',
		asyncHandler(async (_req, res) => {
			const state = await browser.getState()
			res.json(state)
		}),
	)

	router.post(
		'/restart',
		asyncHandler(async (_req, res) => {
			await browser.restartEngine()
			res.json({ ok: true })
		}),
	)

	router.post(
		'/tabs',
		asyncHandler(async (req, res) => {
			const body = req.body as CreateTabRequest
			const tab = await browser.createTab(body)
			res.status(201).json(tab)
		}),
	)

	router.post(
		'/tabs/reopen',
		asyncHandler(async (_req, res) => {
			const tab = await browser.reopenClosedTab()
			if (!tab) {
				res.status(404).json({ error: 'No closed tabs to reopen' })
				return
			}
			res.json(tab)
		}),
	)

	router.post(
		'/tabs/:tabId/switch',
		asyncHandler(async (req, res) => {
			const tabId = param(req, 'tabId')
			const tab = await browser.switchTab(tabId)
			if (!tab) {
				res.status(404).json({ error: 'Tab not found' })
				return
			}
			res.json(tab)
		}),
	)

	router.delete(
		'/tabs/:tabId',
		asyncHandler(async (req, res) => {
			const tabId = param(req, 'tabId')
			const closed = await browser.closeTab(tabId)
			res.json({ ok: closed })
		}),
	)

	router.post(
		'/tabs/:tabId/duplicate',
		asyncHandler(async (req, res) => {
			const tabId = param(req, 'tabId')
			const tab = await browser.duplicateTab(tabId)
			if (!tab) {
				res.status(404).json({ error: 'Tab not found' })
				return
			}
			res.status(201).json(tab)
		}),
	)

	router.post(
		'/tabs/:tabId/navigate',
		asyncHandler(async (req, res) => {
			const tabId = param(req, 'tabId')
			const body = req.body as NavigateRequest
			const tab = await browser.navigate(tabId, body)
			if (!tab) {
				res.status(404).json({ error: 'Tab not found' })
				return
			}
			res.json(tab)
		}),
	)

	router.post(
		'/tabs/:tabId/action',
		asyncHandler(async (req, res) => {
			const tabId = param(req, 'tabId')
			const body = req.body as TabActionRequest
			const tab = await browser.performAction(tabId, body)
			if (!tab) {
				res.status(404).json({ error: 'Tab not found' })
				return
			}
			res.json(tab)
		}),
	)

	router.post(
		'/tabs/:tabId/viewport',
		asyncHandler(async (req, res) => {
			const tabId = param(req, 'tabId')
			const body = req.body as { viewport: BrowserViewport }
			const tab = await browser.setViewport(tabId, body.viewport)
			if (!tab) {
				res.status(404).json({ error: 'Tab not found' })
				return
			}
			res.json(tab)
		}),
	)

	router.post(
		'/tabs/:tabId/find',
		asyncHandler(async (req, res) => {
			const tabId = param(req, 'tabId')
			const body = req.body as FindOnPageRequest
			const result = await browser.findOnPage(tabId, body)
			res.json(result)
		}),
	)

	router.get(
		'/tabs/:tabId/context',
		asyncHandler(async (req, res) => {
			const tabId = param(req, 'tabId')
			const ctx = await browser.getPageContext(tabId)
			if (!ctx) {
				res.status(404).json({ error: 'Tab context unavailable' })
				return
			}
			res.json(ctx)
		}),
	)

	router.post(
		'/tabs/:tabId/screenshot',
		asyncHandler(async (req, res) => {
			const tabId = param(req, 'tabId')
			const screenshot = await browser.takeScreenshot(tabId)
			if (!screenshot) {
				res.status(500).json({ error: 'Failed to capture screenshot' })
				return
			}
			res.json({ screenshot })
		}),
	)

	// Bookmarks
	router.get(
		'/bookmarks',
		asyncHandler(async (_req, res) => {
			const list = browser.getBookmarks()
			res.json(list)
		}),
	)

	router.post(
		'/bookmarks',
		asyncHandler(async (req, res) => {
			const { title, url, favicon } = req.body as { title: string; url: string; favicon?: string }
			if (!url) {
				res.status(400).json({ error: 'URL is required' })
				return
			}
			const entry = await browser.addBookmark(title, url, favicon)
			res.status(201).json(entry)
		}),
	)

	router.delete(
		'/bookmarks/:id',
		asyncHandler(async (req, res) => {
			const id = param(req, 'id')
			const removed = await browser.removeBookmark(id)
			res.json({ ok: removed })
		}),
	)

	// History
	router.get(
		'/history',
		asyncHandler(async (_req, res) => {
			const list = browser.getHistory()
			res.json(list)
		}),
	)

	router.delete(
		'/history',
		asyncHandler(async (_req, res) => {
			await browser.clearHistory()
			res.json({ ok: true })
		}),
	)

	// Downloads
	router.get(
		'/downloads',
		asyncHandler(async (_req, res) => {
			const list = browser.getDownloads()
			res.json(list)
		}),
	)

	router.delete(
		'/downloads/:id',
		asyncHandler(async (req, res) => {
			const id = param(req, 'id')
			const removed = browser.removeDownload(id)
			res.json({ ok: removed })
		}),
	)

	// Console Logs & Network Errors
	router.get(
		'/logs',
		asyncHandler(async (_req, res) => {
			const logs = browser.getConsoleLogs()
			res.json(logs)
		}),
	)

	router.delete(
		'/logs',
		asyncHandler(async (_req, res) => {
			browser.clearConsoleLogs()
			res.json({ ok: true })
		}),
	)

	router.get(
		'/network-errors',
		asyncHandler(async (_req, res) => {
			const errors = browser.getNetworkErrors()
			res.json(errors)
		}),
	)

	router.delete(
		'/network-errors',
		asyncHandler(async (_req, res) => {
			browser.clearNetworkErrors()
			res.json({ ok: true })
		}),
	)

	return router
}

export function setupBrowserWebSocket(
	wss: WebSocketServer,
	browser: BrowserService,
	config: ServerConfig,
): void {
	wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
		const url = new URL(req.url ?? '', `http://${req.headers.host || 'localhost'}`)
		const token = url.searchParams.get('token')

		if (config.token && token !== config.token) {
			const authHeader = req.headers.authorization
			const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
			if (bearer !== config.token) {
				ws.send(
					JSON.stringify({
						type: 'error',
						message: 'Unauthorized WebSocket connection',
					} satisfies BrowserServerMessage),
				)
				ws.close(4401, 'Unauthorized')
				return
			}
		}

		browser.addClient(ws)

		ws.on('message', (data: Buffer | string) => {
			try {
				const parsed = JSON.parse(data.toString()) as BrowserClientMessage
				void browser.handleClientMessage(ws, parsed)
			} catch {
				// invalid message format
			}
		})

		ws.on('close', () => {
			browser.removeClient(ws)
		})

		ws.on('error', () => {
			browser.removeClient(ws)
		})
	})
}

