import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright-core'
import { v4 as uuidv4 } from 'uuid'
import type { WebSocket } from 'ws'
import type { ServerConfig } from '../config.js'
import type {
	BookmarkEntry,
	BrowserClientMessage,
	BrowserKeyMessage,
	BrowserPointerMessage,
	BrowserScrollMessage,
	BrowserServerMessage,
	BrowserSessionState,
	BrowserTab,
	BrowserTouchMessage,
	BrowserViewport,
	ConsoleEntry,
	DownloadItem,
	FindOnPageRequest,
	FindOnPageResult,
	HistoryEntry,
	NavigateRequest,
	NetworkErrorEntry,
	PageContextInfo,
	TabActionRequest,
} from '../types/browser.js'

type TabRecord = {
	id: string
	page: Page
	tab: BrowserTab
	cdp?: CDPSession
	screencastActive: boolean
}

export class BrowserService {
	readonly config: ServerConfig
	private browserDir: string
	private profileDir: string
	private downloadsDir: string
	private historyFile: string
	private bookmarksFile: string
	private sessionFile: string

	private context: BrowserContext | null = null
	private tabs: Map<string, TabRecord> = new Map()
	private activeTabId: string | null = null
	private closedTabs: Array<{ url: string; title: string }> = []

	private consoleLogs: ConsoleEntry[] = []
	private networkErrors: NetworkErrorEntry[] = []
	private bookmarks: BookmarkEntry[] = []
	private history: HistoryEntry[] = []
	private downloads: DownloadItem[] = []

	private subscribers: Map<string, Set<WebSocket>> = new Map() // tabId -> sockets
	private allClients: Set<WebSocket> = new Set()
	private isRunning = false
	private isRecovering = false

	constructor(config: ServerConfig) {
		this.config = config
		this.browserDir = join(config.dataDir, 'browser')
		this.profileDir = join(this.browserDir, 'profile')
		this.downloadsDir = join(config.dataDir, 'downloads')
		this.historyFile = join(this.browserDir, 'history.json')
		this.bookmarksFile = join(this.browserDir, 'bookmarks.json')
		this.sessionFile = join(this.browserDir, 'session.json')
	}

	async init(): Promise<void> {
		await mkdir(this.browserDir, { recursive: true })
		await mkdir(this.profileDir, { recursive: true })
		await mkdir(this.downloadsDir, { recursive: true })

		await this.loadPersistedData()
		// Lazy initialize or start initial context
		try {
			await this.ensureRunning()
		} catch (err) {
			console.warn('[BrowserService] Initial Chromium launch deferred:', err instanceof Error ? err.message : err)
		}
	}

	private async loadPersistedData(): Promise<void> {
		try {
			if (existsSync(this.bookmarksFile)) {
				const content = await readFile(this.bookmarksFile, 'utf8')
				this.bookmarks = JSON.parse(content)
			}
		} catch {
			this.bookmarks = []
		}

		try {
			if (existsSync(this.historyFile)) {
				const content = await readFile(this.historyFile, 'utf8')
				this.history = JSON.parse(content)
			}
		} catch {
			this.history = []
		}
	}

	private async saveBookmarks(): Promise<void> {
		try {
			await writeFile(this.bookmarksFile, JSON.stringify(this.bookmarks, null, 2), 'utf8')
		} catch (err) {
			console.error('[BrowserService] Failed to save bookmarks:', err)
		}
	}

	private async saveHistory(): Promise<void> {
		try {
			// Limit history to 500 entries
			const trimmed = this.history.slice(0, 500)
			await writeFile(this.historyFile, JSON.stringify(trimmed, null, 2), 'utf8')
		} catch (err) {
			console.error('[BrowserService] Failed to save history:', err)
		}
	}

	private async saveSession(): Promise<void> {
		try {
			const savedTabs = Array.from(this.tabs.values()).map((t) => ({
				url: t.tab.url,
				title: t.tab.title,
				viewport: t.tab.viewport,
			}))
			await writeFile(
				this.sessionFile,
				JSON.stringify({ tabs: savedTabs, activeTabId: this.activeTabId }, null, 2),
				'utf8',
			)
		} catch {
			// ignore session save errors
		}
	}

	async ensureRunning(): Promise<void> {
		if (this.context && this.isRunning) return

		this.isRecovering = true
		this.broadcastStatus()

		try {
			const userAgent =
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'

			this.context = await chromium.launchPersistentContext(this.profileDir, {
				headless: true,
				userAgent,
				locale: 'en-US',
				permissions: ['clipboard-read', 'clipboard-write', 'notifications'],
				args: [
					'--disable-blink-features=AutomationControlled',
					'--no-default-browser-check',
					'--no-first-run',
					'--disable-infobars',
					'--disable-background-timer-throttling',
					'--disable-backgrounding-occluded-windows',
					'--disable-renderer-backgrounding',
					'--password-store=basic',
					'--use-mock-keychain',
				],
				viewport: { width: 1280, height: 800 },
				deviceScaleFactor: 1,
				acceptDownloads: true,
			})

			// Add stealth init script so websites don't detect automation or block logins
			await this.context.addInitScript(() => {
				// Mask navigator.webdriver
				try {
					Object.defineProperty(navigator, 'webdriver', {
						get: () => undefined,
					})
				} catch {
					// ignore
				}

				// Ensure window.chrome runtime object exists
				try {
					const win = window as unknown as { chrome?: Record<string, unknown> }
					if (!win.chrome) {
						win.chrome = {
							runtime: {},
							loadTimes: () => {},
							csi: () => {},
							app: {},
						}
					}
				} catch {
					// ignore
				}

				// Ensure navigator.plugins is populated
				try {
					if (!navigator.plugins || navigator.plugins.length === 0) {
						Object.defineProperty(navigator, 'plugins', {
							get: () => [1, 2, 3, 4, 5],
						})
					}
				} catch {
					// ignore
				}

				// Ensure navigator.languages is populated
				try {
					if (!navigator.languages || navigator.languages.length === 0) {
						Object.defineProperty(navigator, 'languages', {
							get: () => ['en-US', 'en'],
						})
					}
				} catch {
					// ignore
				}
			})

			this.isRunning = true
			this.isRecovering = false

			this.context.on('close', () => {
				console.warn('[BrowserService] Chromium context closed.')
				this.isRunning = false
				this.context = null
				this.tabs.clear()
				this.broadcastStatus()
			})

			this.context.on('page', async (page) => {
				// Handle popups or window.open (e.g. OAuth login popups)
				try {
					const record = await this.registerPage(page)
					this.activeTabId = record.id
					this.broadcastStatus()
				} catch (err) {
					console.error('[BrowserService] Failed to register popup page:', err)
				}
			})

			// Set up existing pages
			const pages = this.context.pages()
			if (pages.length > 0) {
				for (const page of pages) {
					await this.registerPage(page)
				}
			} else {
				// Create initial page
				const newPage = await this.context.newPage()
				await this.registerPage(newPage, 'https://github.com')
			}

			this.broadcastStatus()
		} catch (err) {
			this.isRunning = false
			this.isRecovering = false
			this.broadcastStatus()
			throw err
		}
	}

	private async registerPage(page: Page, initialUrl?: string): Promise<TabRecord> {
		const tabId = uuidv4()
		const viewport: BrowserViewport = {
			width: 1280,
			height: 800,
			deviceScaleFactor: 1,
			isMobile: false,
			hasTouch: false,
		}

		const tab: BrowserTab = {
			id: tabId,
			title: 'New Tab',
			url: initialUrl || 'about:blank',
			isLoading: false,
			canGoBack: false,
			canGoForward: false,
			zoomLevel: 1.0,
			viewport,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}

		const record: TabRecord = {
			id: tabId,
			page,
			tab,
			screencastActive: false,
		}

		this.tabs.set(tabId, record)
		if (!this.activeTabId) {
			this.activeTabId = tabId
		}

		// Attach page event listeners
		page.on('framenavigated', async (frame) => {
			if (frame === page.mainFrame()) {
				tab.url = frame.url()
				try {
					const title = await page.title()
					if (title) tab.title = title
				} catch {
					// ignore
				}
				tab.updatedAt = Date.now()
				void this.updateTabInfo(record)
			}
		})

		page.on('load', async () => {
			tab.isLoading = false
			try {
				const title = await page.title()
				if (title) tab.title = title
			} catch {
				// ignore
			}
			void this.updateTabInfo(record)
		})

		page.on('domcontentloaded', async () => {
			tab.isLoading = false
			try {
				const title = await page.title()
				if (title) tab.title = title
			} catch {
				// ignore
			}
			void this.updateTabInfo(record)
		})

		page.on('console', (msg) => {
			const entry: ConsoleEntry = {
				id: uuidv4(),
				tabId,
				level: msg.type() === 'error' ? 'error' : msg.type() === 'warning' ? 'warn' : msg.type() === 'info' ? 'info' : 'log',
				text: msg.text(),
				timestamp: Date.now(),
				location: msg.location() ? `${msg.location().url}:${msg.location().lineNumber}` : undefined,
			}
			this.consoleLogs.unshift(entry)
			if (this.consoleLogs.length > 500) this.consoleLogs.pop()
			this.broadcast({ type: 'console', entry })
		})

		page.on('pageerror', (err) => {
			const entry: ConsoleEntry = {
				id: uuidv4(),
				tabId,
				level: 'error',
				text: err.message || err.toString(),
				timestamp: Date.now(),
				location: err.stack?.split('\n')[1]?.trim(),
			}
			this.consoleLogs.unshift(entry)
			if (this.consoleLogs.length > 500) this.consoleLogs.pop()
			this.broadcast({ type: 'console', entry })
		})

		page.on('requestfailed', (req) => {
			const entry: NetworkErrorEntry = {
				id: uuidv4(),
				tabId,
				url: req.url(),
				method: req.method(),
				status: undefined,
				errorText: req.failure()?.errorText || 'Request failed',
				timestamp: Date.now(),
			}
			this.networkErrors.unshift(entry)
			if (this.networkErrors.length > 500) this.networkErrors.pop()
			this.broadcast({ type: 'networkError', entry })
		})

		page.on('download', async (download) => {
			const downloadId = uuidv4()
			const filename = download.suggestedFilename()
			const localPath = join(this.downloadsDir, filename)

			const item: DownloadItem = {
				id: downloadId,
				filename,
				url: download.url(),
				state: 'in_progress',
				localPath,
				suggestedFilename: filename,
				createdAt: Date.now(),
			}

			this.downloads.unshift(item)
			this.broadcast({ type: 'downloadUpdated', item })

			try {
				await download.saveAs(localPath)
				item.state = 'completed'
				this.broadcast({ type: 'downloadUpdated', item })
			} catch (err) {
				item.state = 'failed'
				item.error = err instanceof Error ? err.message : 'Download failed'
				this.broadcast({ type: 'downloadUpdated', item })
			}
		})

		page.on('close', () => {
			this.handlePageClosed(tabId)
		})

		if (initialUrl && initialUrl !== 'about:blank') {
			tab.isLoading = true
			page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {
				tab.isLoading = false
				void this.updateTabInfo(record)
			})
		}

		void this.updateTabInfo(record)
		return record
	}

	private async updateTabInfo(record: TabRecord): Promise<void> {
		try {
			const title = await record.page.title()
			if (title) record.tab.title = title
			record.tab.url = record.page.url()
			record.tab.updatedAt = Date.now()

			// Record in history if valid http/https
			if (record.tab.url.startsWith('http://') || record.tab.url.startsWith('https://')) {
				const existingIdx = this.history.findIndex((h) => h.url === record.tab.url)
				if (existingIdx !== -1) {
					this.history.splice(existingIdx, 1)
				}
				this.history.unshift({
					id: uuidv4(),
					title: record.tab.title || record.tab.url,
					url: record.tab.url,
					visitedAt: Date.now(),
				})
				void this.saveHistory()
			}

			this.broadcast({ type: 'tabUpdated', tab: record.tab })
			void this.saveSession()
		} catch {
			// page might be closed
		}
	}

	private handlePageClosed(tabId: string): void {
		const record = this.tabs.get(tabId)
		if (record) {
			this.closedTabs.push({ url: record.tab.url, title: record.tab.title })
			this.tabs.delete(tabId)
			this.broadcast({ type: 'tabClosed', tabId })

			if (this.activeTabId === tabId) {
				const remaining = Array.from(this.tabs.keys())
				this.activeTabId = remaining.length > 0 ? remaining[0] : null
			}
			this.broadcastStatus()
			void this.saveSession()
		}
	}

	resolveOmniboxInput(input: string): string {
		const trimmed = input.trim()
		if (!trimmed) return 'about:blank'

		// If full scheme provided
		if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('about:')) {
			return trimmed
		}

		// Localhost patterns
		if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed)) {
			return `http://${trimmed}`
		}

		// Standard domain check (e.g. github.com, docs.rs, vitejs.dev)
		if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(:[0-9]+)?(\/.*)?$/i.test(trimmed)) {
			return `https://${trimmed}`
		}

		// Web search
		return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`
	}

	// ==========================================
	// Public Tab & Navigation API
	// ==========================================

	async getState(): Promise<BrowserSessionState> {
		await this.ensureRunning()
		return {
			tabs: Array.from(this.tabs.values()).map((t) => t.tab),
			activeTabId: this.activeTabId,
			isRunning: this.isRunning,
			isRecovering: this.isRecovering,
		}
	}

	async createTab(req?: { url?: string; viewport?: BrowserViewport }): Promise<BrowserTab> {
		await this.ensureRunning()
		if (!this.context) throw new Error('Browser context unavailable')

		const page = await this.context.newPage()
		if (req?.viewport) {
			await page.setViewportSize({ width: req.viewport.width, height: req.viewport.height })
		}

		const resolvedUrl = req?.url ? this.resolveOmniboxInput(req.url) : 'https://github.com'
		const record = await this.registerPage(page, resolvedUrl)
		this.activeTabId = record.id
		this.broadcastStatus()
		return record.tab
	}

	async switchTab(tabId: string): Promise<BrowserTab | null> {
		const record = this.tabs.get(tabId)
		if (!record) return null
		this.activeTabId = tabId
		await record.page.bringToFront().catch(() => {})
		this.broadcastStatus()
		return record.tab
	}

	async closeTab(tabId: string): Promise<boolean> {
		const record = this.tabs.get(tabId)
		if (!record) return false
		await record.page.close().catch(() => {})
		this.handlePageClosed(tabId)
		return true
	}

	async duplicateTab(tabId: string): Promise<BrowserTab | null> {
		const record = this.tabs.get(tabId)
		if (!record) return null
		return this.createTab({ url: record.tab.url, viewport: record.tab.viewport })
	}

	async reopenClosedTab(): Promise<BrowserTab | null> {
		if (this.closedTabs.length === 0) return null
		const last = this.closedTabs.pop()!
		return this.createTab({ url: last.url })
	}

	async navigate(tabId: string, req: NavigateRequest): Promise<BrowserTab | null> {
		const record = this.tabs.get(tabId)
		if (!record) return null

		const targetUrl = this.resolveOmniboxInput(req.urlOrQuery)
		record.tab.isLoading = true
		record.tab.url = targetUrl
		this.broadcast({ type: 'tabUpdated', tab: record.tab })

		try {
			await record.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
		} catch {
			// ignore navigation timeout/abort
		} finally {
			record.tab.isLoading = false
			await this.updateTabInfo(record)
		}

		return record.tab
	}

	async performAction(tabId: string, req: TabActionRequest): Promise<BrowserTab | null> {
		const record = this.tabs.get(tabId)
		if (!record) return null

		switch (req.action) {
			case 'back':
				await record.page.goBack({ timeout: 10000 }).catch(() => {})
				break
			case 'forward':
				await record.page.goForward({ timeout: 10000 }).catch(() => {})
				break
			case 'reload':
				record.tab.isLoading = true
				this.broadcast({ type: 'tabUpdated', tab: record.tab })
				await record.page.reload({ timeout: 30000 }).catch(() => {})
				record.tab.isLoading = false
				break
			case 'stop':
				// Stop loading via evaluate
				await record.page.evaluate(() => window.stop()).catch(() => {})
				record.tab.isLoading = false
				break
			case 'zoom_in':
				record.tab.zoomLevel = Math.min(3.0, Number((record.tab.zoomLevel + 0.1).toFixed(2)))
				await record.page.evaluate((z) => {
					const el = document.body as unknown as { style: { zoom?: string } }
					if (el?.style) el.style.zoom = String(z)
				}, record.tab.zoomLevel).catch(() => {})
				break
			case 'zoom_out':
				record.tab.zoomLevel = Math.max(0.3, Number((record.tab.zoomLevel - 0.1).toFixed(2)))
				await record.page.evaluate((z) => {
					const el = document.body as unknown as { style: { zoom?: string } }
					if (el?.style) el.style.zoom = String(z)
				}, record.tab.zoomLevel).catch(() => {})
				break
			case 'zoom_reset':
				record.tab.zoomLevel = 1.0
				await record.page.evaluate(() => {
					const el = document.body as unknown as { style: { zoom?: string } }
					if (el?.style) el.style.zoom = '1.0'
				}).catch(() => {})
				break
		}

		await this.updateTabInfo(record)
		return record.tab
	}

	async setViewport(tabId: string, viewport: BrowserViewport): Promise<BrowserTab | null> {
		const record = this.tabs.get(tabId)
		if (!record) return null

		record.tab.viewport = viewport
		try {
			await record.page.setViewportSize({ width: viewport.width, height: viewport.height })
			if (record.cdp && record.screencastActive) {
				// Restart screencast with new dimensions
				await record.cdp.send('Page.startScreencast', {
					format: 'jpeg',
					quality: 80,
					maxWidth: viewport.width,
					maxHeight: viewport.height,
					everyNthFrame: 1,
				}).catch(() => {})
			}
		} catch {
			// ignore
		}

		this.broadcast({ type: 'tabUpdated', tab: record.tab })
		return record.tab
	}

	// ==========================================
	// Find on Page, Screenshots & Page Context
	// ==========================================

	async findOnPage(tabId: string, req: FindOnPageRequest): Promise<FindOnPageResult> {
		const record = this.tabs.get(tabId)
		if (!record) return { matchCount: 0, activeMatchOrdinal: 0 }

		try {
			const result = await record.page.evaluate(
				({ text, forward }) => {
					// Use window.find standard API where supported
					const win = window as unknown as { find?: (text: string, caseSensitive: boolean, backwards: boolean, wrap: boolean, wholeWord: boolean, searchInFrames: boolean, showDialog: boolean) => boolean }
					if (typeof win.find === 'function') {
						const found = win.find(text, false, !forward, true, false, true, false)
						return { matchCount: found ? 1 : 0, activeMatchOrdinal: found ? 1 : 0 }
					}
					return { matchCount: 0, activeMatchOrdinal: 0 }
				},
				{ text: req.text, forward: req.forward ?? true },
			)
			return result
		} catch {
			return { matchCount: 0, activeMatchOrdinal: 0 }
		}
	}

	async getPageContext(tabId: string): Promise<PageContextInfo | null> {
		const record = this.tabs.get(tabId)
		if (!record) return null

		try {
			const title = await record.page.title()
			const url = record.page.url()

			const pageData = await record.page.evaluate(() => {
				const selection = window.getSelection()?.toString()?.trim() || ''
				const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
					.map((h) => `${h.tagName}: ${h.textContent?.trim()}`)
					.slice(0, 15)
					.join('\n')

				const bodyText = document.body ? document.body.innerText.slice(0, 4000) : ''
				return { selection, headings, bodyText }
			}).catch(() => ({ selection: '', headings: '', bodyText: '' }))

			let screenshotBase64: string | undefined
			try {
				const buf = await record.page.screenshot({ type: 'jpeg', quality: 75 })
				screenshotBase64 = buf.toString('base64')
			} catch {
				// ignore screenshot error
			}

			const textSummary = [
				pageData.headings ? `### Headings:\n${pageData.headings}` : '',
				pageData.bodyText ? `### Page Content:\n${pageData.bodyText}` : '',
			]
				.filter(Boolean)
				.join('\n\n')

			return {
				title: title || url,
				url,
				selection: pageData.selection || undefined,
				textSummary: textSummary || undefined,
				screenshotBase64,
			}
		} catch (err) {
			console.error('[BrowserService] Failed to extract page context:', err)
			return null
		}
	}

	async takeScreenshot(tabId: string): Promise<string | null> {
		const record = this.tabs.get(tabId)
		if (!record) return null
		try {
			const buf = await record.page.screenshot({ type: 'png' })
			return buf.toString('base64')
		} catch {
			return null
		}
	}

	// ==========================================
	// Bookmarks, History & Downloads Management
	// ==========================================

	getBookmarks(): BookmarkEntry[] {
		return [...this.bookmarks]
	}

	async addBookmark(title: string, url: string, favicon?: string): Promise<BookmarkEntry> {
		const entry: BookmarkEntry = {
			id: uuidv4(),
			title: title.trim() || url,
			url,
			favicon,
			createdAt: Date.now(),
		}
		this.bookmarks.unshift(entry)
		await this.saveBookmarks()
		return entry
	}

	async removeBookmark(id: string): Promise<boolean> {
		const idx = this.bookmarks.findIndex((b) => b.id === id)
		if (idx === -1) return false
		this.bookmarks.splice(idx, 1)
		await this.saveBookmarks()
		return true
	}

	getHistory(): HistoryEntry[] {
		return [...this.history]
	}

	async clearHistory(): Promise<void> {
		this.history = []
		await this.saveHistory()
	}

	getDownloads(): DownloadItem[] {
		return [...this.downloads]
	}

	removeDownload(id: string): boolean {
		const idx = this.downloads.findIndex((d) => d.id === id)
		if (idx === -1) return false
		this.downloads.splice(idx, 1)
		return true
	}

	getConsoleLogs(): ConsoleEntry[] {
		return [...this.consoleLogs]
	}

	clearConsoleLogs(): void {
		this.consoleLogs = []
	}

	getNetworkErrors(): NetworkErrorEntry[] {
		return [...this.networkErrors]
	}

	clearNetworkErrors(): void {
		this.networkErrors = []
	}

	// ==========================================
	// WebSocket Streaming & Input Controller
	// ==========================================

	addClient(ws: WebSocket): void {
		this.allClients.add(ws)
		ws.send(
			JSON.stringify({
				type: 'status',
				isRunning: this.isRunning,
				isRecovering: this.isRecovering,
				activeTabId: this.activeTabId,
			} satisfies BrowserServerMessage),
		)
	}

	removeClient(ws: WebSocket): void {
		this.allClients.delete(ws)
		for (const [tabId, set] of this.subscribers.entries()) {
			set.delete(ws)
			if (set.size === 0) {
				void this.stopScreencastForTab(tabId)
			}
		}
	}

	private async startScreencastForTab(tabId: string, viewport?: BrowserViewport): Promise<void> {
		const record = this.tabs.get(tabId)
		if (!record) return

		try {
			if (!record.cdp) {
				record.cdp = await record.page.context().newCDPSession(record.page)
				await record.cdp.send('Page.enable').catch(() => {})
				await record.cdp.send('Emulation.setTouchEmulationEnabled', {
					enabled: true,
					maxTouchPoints: 5,
				}).catch(() => {})

				record.cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
					// Send frame to all subscribed sockets for this tab
					const sockets = this.subscribers.get(tabId)
					if (sockets && sockets.size > 0) {
						const msg = JSON.stringify({
							type: 'frame',
							tabId,
							data,
							metadata,
							sessionId,
						} satisfies BrowserServerMessage)

						for (const s of sockets) {
							if (s.readyState === 1) s.send(msg)
						}
					}

					// Acknowledge frame to keep pipeline flowing
					record.cdp?.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
				})
			}

			const width = viewport?.width || record.tab.viewport.width || 1280
			const height = viewport?.height || record.tab.viewport.height || 800

			await record.cdp.send('Page.startScreencast', {
				format: 'jpeg',
				quality: 80,
				maxWidth: width,
				maxHeight: height,
				everyNthFrame: 1,
			})
			record.screencastActive = true

			// Immediately capture and emit an initial frame so the client receives a render instantly
			try {
				const buf = await record.page.screenshot({ type: 'jpeg', quality: 80 })
				const sockets = this.subscribers.get(tabId)
				if (sockets && sockets.size > 0) {
					const initialMsg = JSON.stringify({
						type: 'frame',
						tabId,
						data: buf.toString('base64'),
						metadata: {
							offsetTop: 0,
							pageScaleFactor: 1,
							deviceWidth: width,
							deviceHeight: height,
							scrollOffsetX: 0,
							scrollOffsetY: 0,
							timestamp: Date.now(),
						},
						sessionId: 0,
					} satisfies BrowserServerMessage)

					for (const s of sockets) {
						if (s.readyState === 1) s.send(initialMsg)
					}
				}
			} catch {
				// ignore initial frame capture errors
			}
		} catch (err) {
			console.warn('[BrowserService] Screencast start warning:', err instanceof Error ? err.message : err)
		}
	}

	private async stopScreencastForTab(tabId: string): Promise<void> {
		const record = this.tabs.get(tabId)
		if (!record || !record.cdp || !record.screencastActive) return
		try {
			await record.cdp.send('Page.stopScreencast')
			record.screencastActive = false
		} catch {
			// ignore
		}
	}

	async handleClientMessage(ws: WebSocket, msg: BrowserClientMessage): Promise<void> {
		switch (msg.type) {
			case 'subscribe': {
				let subs = this.subscribers.get(msg.tabId)
				if (!subs) {
					subs = new Set()
					this.subscribers.set(msg.tabId, subs)
				}
				subs.add(ws)
				await this.startScreencastForTab(msg.tabId, msg.viewport)
				break
			}

			case 'unsubscribe': {
				const subs = this.subscribers.get(msg.tabId)
				if (subs) {
					subs.delete(ws)
					if (subs.size === 0) {
						await this.stopScreencastForTab(msg.tabId)
					}
				}
				break
			}

			case 'pointer': {
				await this.dispatchPointer(msg)
				break
			}

			case 'touch': {
				await this.dispatchTouch(msg)
				break
			}

			case 'scroll': {
				await this.dispatchScroll(msg)
				break
			}

			case 'key': {
				await this.dispatchKey(msg)
				break
			}

			case 'insertText': {
				const record = this.tabs.get(msg.tabId)
				if (record) {
					await record.page.keyboard.insertText(msg.text).catch(() => {})
				}
				break
			}

			case 'resize': {
				await this.setViewport(msg.tabId, msg.viewport)
				break
			}

			case 'ackFrame': {
				const record = this.tabs.get(msg.tabId)
				if (record?.cdp && msg.sessionId !== undefined) {
					await record.cdp.send('Page.screencastFrameAck', { sessionId: msg.sessionId }).catch(() => {})
				}
				break
			}

			case 'pause': {
				for (const [tabId, set] of this.subscribers.entries()) {
					if (set.has(ws)) {
						set.delete(ws)
						if (set.size === 0) {
							void this.stopScreencastForTab(tabId)
						}
					}
				}
				break
			}

			case 'resume': {
				if (this.activeTabId) {
					let subs = this.subscribers.get(this.activeTabId)
					if (!subs) {
						subs = new Set()
						this.subscribers.set(this.activeTabId, subs)
					}
					subs.add(ws)
					await this.startScreencastForTab(this.activeTabId)
				}
				break
			}
		}
	}

	private async dispatchPointer(msg: BrowserPointerMessage): Promise<void> {
		const record = this.tabs.get(msg.tabId)
		if (!record) return

		try {
			const button = msg.button || 'left'
			if (msg.eventType === 'mousemove') {
				await record.page.mouse.move(msg.x, msg.y)
			} else if (msg.eventType === 'mousedown') {
				await record.page.mouse.move(msg.x, msg.y)
				await record.page.mouse.down({ button, clickCount: msg.clickCount || 1 })
			} else if (msg.eventType === 'mouseup') {
				await record.page.mouse.up({ button, clickCount: msg.clickCount || 1 })
			}
		} catch {
			// ignore input errors on closed page
		}
	}

	private async dispatchTouch(msg: BrowserTouchMessage): Promise<void> {
		const record = this.tabs.get(msg.tabId)
		if (!record) return

		try {
			if (record.cdp) {
				const touchPoints = msg.points.map((p) => ({
					x: p.x,
					y: p.y,
					radiusX: p.radiusX || 1,
					radiusY: p.radiusY || 1,
					id: p.id,
					force: p.force || 1.0,
				}))

				const cdpType =
					msg.eventType === 'touchstart'
						? 'touchStart'
						: msg.eventType === 'touchmove'
						? 'touchMove'
						: msg.eventType === 'touchend'
						? 'touchEnd'
						: 'touchCancel'

				await record.cdp.send('Input.dispatchTouchEvent', {
					type: cdpType,
					touchPoints,
				})
			} else if (msg.points[0]) {
				// Fallback mouse click
				if (msg.eventType === 'touchstart') {
					await record.page.mouse.move(msg.points[0].x, msg.points[0].y)
					await record.page.mouse.down()
				} else if (msg.eventType === 'touchend') {
					await record.page.mouse.up()
				}
			}
		} catch {
			// ignore
		}
	}

	private async dispatchScroll(msg: BrowserScrollMessage): Promise<void> {
		const record = this.tabs.get(msg.tabId)
		if (!record) return

		try {
			await record.page.mouse.move(msg.x, msg.y)
			await record.page.mouse.wheel(msg.deltaX, msg.deltaY)
		} catch {
			// ignore
		}
	}

	private async dispatchKey(msg: BrowserKeyMessage): Promise<void> {
		const record = this.tabs.get(msg.tabId)
		if (!record) return

		try {
			if (msg.eventType === 'keydown' || msg.eventType === 'rawKeyDown') {
				await record.page.keyboard.down(msg.key)
			} else if (msg.eventType === 'keyup') {
				await record.page.keyboard.up(msg.key)
			} else if (msg.eventType === 'char' && msg.text) {
				await record.page.keyboard.insertText(msg.text)
			}
		} catch {
			// ignore
		}
	}

	private broadcast(msg: BrowserServerMessage): void {
		const payload = JSON.stringify(msg)
		for (const client of this.allClients) {
			if (client.readyState === 1) {
				try {
					client.send(payload)
				} catch {
					// client error
				}
			}
		}
	}

	private broadcastStatus(): void {
		this.broadcast({
			type: 'status',
			isRunning: this.isRunning,
			isRecovering: this.isRecovering,
			activeTabId: this.activeTabId,
		})
	}
}

