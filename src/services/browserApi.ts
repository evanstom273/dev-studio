import type {
	BookmarkEntry,
	BrowserSessionState,
	BrowserTab,
	BrowserViewport,
	ConsoleEntry,
	CreateTabRequest,
	DownloadItem,
	FindOnPageRequest,
	FindOnPageResult,
	HistoryEntry,
	NetworkErrorEntry,
	PageContextInfo,
	TabActionRequest,
} from '../types/index.js'
import { apiFetch, getApiBase, loadConnectionConfig } from './apiClient.js'

export const browserApi = {
	async getState(): Promise<BrowserSessionState> {
		return apiFetch<BrowserSessionState>('/api/browser/state')
	},

	async restartEngine(): Promise<void> {
		await apiFetch<{ ok: boolean }>('/api/browser/restart', {
			method: 'POST',
		})
	},

	async createTab(req?: CreateTabRequest): Promise<BrowserTab> {
		return apiFetch<BrowserTab>('/api/browser/tabs', {
			method: 'POST',
			body: JSON.stringify(req ?? {}),
		})
	},

	async reopenClosedTab(): Promise<BrowserTab> {
		return apiFetch<BrowserTab>('/api/browser/tabs/reopen', {
			method: 'POST',
		})
	},

	async switchTab(tabId: string): Promise<BrowserTab> {
		return apiFetch<BrowserTab>(`/api/browser/tabs/${encodeURIComponent(tabId)}/switch`, {
			method: 'POST',
		})
	},

	async closeTab(tabId: string): Promise<boolean> {
		const res = await apiFetch<{ ok: boolean }>(`/api/browser/tabs/${encodeURIComponent(tabId)}`, {
			method: 'DELETE',
		})
		return res.ok
	},

	async duplicateTab(tabId: string): Promise<BrowserTab> {
		return apiFetch<BrowserTab>(`/api/browser/tabs/${encodeURIComponent(tabId)}/duplicate`, {
			method: 'POST',
		})
	},

	async navigate(tabId: string, urlOrQuery: string): Promise<BrowserTab> {
		return apiFetch<BrowserTab>(`/api/browser/tabs/${encodeURIComponent(tabId)}/navigate`, {
			method: 'POST',
			body: JSON.stringify({ urlOrQuery }),
		})
	},

	async performAction(
		tabId: string,
		action: TabActionRequest['action'],
		zoomLevel?: number,
	): Promise<BrowserTab> {
		return apiFetch<BrowserTab>(`/api/browser/tabs/${encodeURIComponent(tabId)}/action`, {
			method: 'POST',
			body: JSON.stringify({ action, zoomLevel }),
		})
	},

	async setViewport(tabId: string, viewport: BrowserViewport): Promise<BrowserTab> {
		return apiFetch<BrowserTab>(`/api/browser/tabs/${encodeURIComponent(tabId)}/viewport`, {
			method: 'POST',
			body: JSON.stringify({ viewport }),
		})
	},

	async findOnPage(tabId: string, req: FindOnPageRequest): Promise<FindOnPageResult> {
		return apiFetch<FindOnPageResult>(`/api/browser/tabs/${encodeURIComponent(tabId)}/find`, {
			method: 'POST',
			body: JSON.stringify(req),
		})
	},

	async getPageContext(tabId: string): Promise<PageContextInfo> {
		return apiFetch<PageContextInfo>(`/api/browser/tabs/${encodeURIComponent(tabId)}/context`)
	},

	async takeScreenshot(tabId: string): Promise<string> {
		const res = await apiFetch<{ screenshot: string }>(
			`/api/browser/tabs/${encodeURIComponent(tabId)}/screenshot`,
			{
				method: 'POST',
			},
		)
		return res.screenshot
	},

	async getBookmarks(): Promise<BookmarkEntry[]> {
		return apiFetch<BookmarkEntry[]>('/api/browser/bookmarks')
	},

	async addBookmark(title: string, url: string, favicon?: string): Promise<BookmarkEntry> {
		return apiFetch<BookmarkEntry>('/api/browser/bookmarks', {
			method: 'POST',
			body: JSON.stringify({ title, url, favicon }),
		})
	},

	async removeBookmark(id: string): Promise<boolean> {
		const res = await apiFetch<{ ok: boolean }>(`/api/browser/bookmarks/${encodeURIComponent(id)}`, {
			method: 'DELETE',
		})
		return res.ok
	},

	async getHistory(): Promise<HistoryEntry[]> {
		return apiFetch<HistoryEntry[]>('/api/browser/history')
	},

	async clearHistory(): Promise<void> {
		await apiFetch<{ ok: boolean }>('/api/browser/history', {
			method: 'DELETE',
		})
	},

	async getDownloads(): Promise<DownloadItem[]> {
		return apiFetch<DownloadItem[]>('/api/browser/downloads')
	},

	async removeDownload(id: string): Promise<boolean> {
		const res = await apiFetch<{ ok: boolean }>(`/api/browser/downloads/${encodeURIComponent(id)}`, {
			method: 'DELETE',
		})
		return res.ok
	},

	async getLogs(): Promise<ConsoleEntry[]> {
		return apiFetch<ConsoleEntry[]>('/api/browser/logs')
	},

	async clearLogs(): Promise<void> {
		await apiFetch<{ ok: boolean }>('/api/browser/logs', {
			method: 'DELETE',
		})
	},

	async getNetworkErrors(): Promise<NetworkErrorEntry[]> {
		return apiFetch<NetworkErrorEntry[]>('/api/browser/network-errors')
	},

	async clearNetworkErrors(): Promise<void> {
		await apiFetch<{ ok: boolean }>('/api/browser/network-errors', {
			method: 'DELETE',
		})
	},

	getWebSocketUrl(): string {
		const base = getApiBase()
		const config = loadConnectionConfig()
		const wsBase = base.startsWith('https://')
			? base.replace(/^https:\/\//, 'wss://')
			: base.replace(/^http:\/\//, 'ws://')
		const tokenParam = config.token ? `?token=${encodeURIComponent(config.token)}` : ''
		return `${wsBase}/api/browser/ws${tokenParam}`
	},
}

