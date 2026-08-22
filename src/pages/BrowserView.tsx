import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project } from '@shared/types/project'
import type {
	BookmarkEntry,
	BrowserClientMessage,
	BrowserFrameMessage,
	BrowserServerMessage,
	BrowserTab,
	BrowserViewport,
	ConsoleEntry,
	DevicePreset,
	DevicePresetId,
	DownloadItem,
	HistoryEntry,
	NetworkErrorEntry,
} from '../types/index.js'
import {
	IconAlertCircle,
	IconAlertTriangle,
	IconBack,
	IconCamera,
	IconClose,
	IconCopy,
	IconDownload,
	IconForward,
	IconHistory,
	IconHome,
	IconKeyboard,
	IconLock,
	IconMaximize,
	IconMinimize,
	IconPaste,
	IconPlus,
	IconRefresh,
	IconSearch,
	IconStar,
	IconStarFilled,
	IconUnlock,
} from '../components/Icons.js'
import { browserApi } from '../services/browserApi.js'
import '../styles/browser.css'

const DEVICE_PRESETS: DevicePreset[] = [
	{ id: 'responsive', label: 'Responsive', width: 1280, height: 800 },
	{ id: 'folded_phone', label: 'Folded Phone (412×915)', width: 412, height: 915, isMobile: true, hasTouch: true },
	{ id: 'pixel_fold_unfolded', label: 'Pixel Fold (1080×1080)', width: 1080, height: 1080, isMobile: true, hasTouch: true },
	{ id: 'tablet', label: 'Tablet (820×1180)', width: 820, height: 1180, isMobile: true, hasTouch: true },
	{ id: 'desktop', label: 'Desktop (1440×900)', width: 1440, height: 900, isMobile: false, hasTouch: false },
]

type BrowserViewProps = {
	project: Project
	isWide?: boolean
	isMaximized?: boolean
	onToggleMaximize?: () => void
	onSendToChat?: (text: string) => void
	onOpenInEditor?: (path: string) => void
}

export function BrowserView({
	isWide = false,
	isMaximized = false,
	onToggleMaximize,
	onSendToChat,
	onOpenInEditor,
}: BrowserViewProps) {
	const [tabs, setTabs] = useState<BrowserTab[]>([])
	const [activeTabId, setActiveTabId] = useState<string | null>(null)
	const [isRunning, setIsRunning] = useState(false)
	const [isRecovering, setIsRecovering] = useState(false)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// Omnibox state
	const [omniboxInput, setOmniboxInput] = useState('')
	const [isEditingUrl, setIsEditingUrl] = useState(false)

	// Viewport & Preset
	const [selectedPreset, setSelectedPreset] = useState<DevicePresetId>('responsive')

	// Drawers & Modals
	const [activeDrawer, setActiveDrawer] = useState<'none' | 'console' | 'network' | 'history' | 'bookmarks' | 'downloads'>('none')
	const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([])
	const [consoleFilter, setConsoleFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'log'>('all')
	const [networkErrors, setNetworkErrors] = useState<NetworkErrorEntry[]>([])
	const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([])
	const [history, setHistory] = useState<HistoryEntry[]>([])
	const [downloads, setDownloads] = useState<DownloadItem[]>([])

	// Find on Page
	const [findOpen, setFindOpen] = useState(false)
	const [findText, setFindText] = useState('')
	const [findCount, setFindCount] = useState<number | null>(null)
	const [findOrdinal, setFindOrdinal] = useState<number | null>(null)

	// Context menu / quick actions menu
	const [menuOpen, setMenuOpen] = useState(false)
	const [copiedNotice, setCopiedNotice] = useState<string | null>(null)

	// Canvas & WebSocket refs
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const containerRef = useRef<HTMLDivElement | null>(null)
	const wsRef = useRef<WebSocket | null>(null)
	const inputProxyRef = useRef<HTMLInputElement | null>(null)
	const menuRef = useRef<HTMLDivElement | null>(null)

	const activeTabIdRef = useRef<string | null>(null)
	activeTabIdRef.current = activeTabId

	const lastAppliedViewportRef = useRef<{ width: number; height: number } | null>(null)
	const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const touchTrackingRef = useRef<{
		startX: number
		startY: number
		startTime: number
		lastClientX: number
		lastClientY: number
		isDragging: boolean
	} | null>(null)

	const activeTab = tabs.find((t) => t.id === activeTabId) || null
	const isBookmarked = activeTab ? bookmarks.some((b) => b.url === activeTab.url) : false

	// Render frame to canvas
	const renderFrame = useCallback((msg: BrowserFrameMessage) => {
		const canvas = canvasRef.current
		if (!canvas) return

		const img = new Image()
		img.onload = () => {
			if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
				canvas.width = img.naturalWidth
				canvas.height = img.naturalHeight
			}
			const ctx = canvas.getContext('2d')
			if (ctx) {
				ctx.drawImage(img, 0, 0)
			}
		}
		img.src = `data:image/jpeg;base64,${msg.data}`
	}, [])

	// Load initial state
	const loadBrowserState = useCallback(async () => {
		try {
			const state = await browserApi.getState()
			setIsRunning(state.isRunning)
			setIsRecovering(Boolean(state.isRecovering))
			setTabs(state.tabs)

			if (state.tabs.length > 0) {
				const active = state.activeTabId && state.tabs.some((t) => t.id === state.activeTabId)
					? state.activeTabId
					: state.tabs[0].id
				setActiveTabId(active)
				const cur = state.tabs.find((t) => t.id === active)
				if (cur) setOmniboxInput(cur.url)
			} else {
				// Measure initial viewport on mobile
				const initialW = containerRef.current?.clientWidth || (isWide ? 1280 : window.innerWidth || 412)
				const initialH = containerRef.current?.clientHeight || (isWide ? 800 : window.innerHeight - 150 || 750)
				const newTab = await browserApi.createTab({
					url: 'https://duckduckgo.com',
					viewport: {
						width: initialW,
						height: initialH,
						deviceScaleFactor: 1,
						isMobile: !isWide,
						hasTouch: !isWide,
					},
				})
				setTabs([newTab])
				setActiveTabId(newTab.id)
				setOmniboxInput(newTab.url)
			}

			// Load bookmarks & history in background
			void browserApi.getBookmarks().then(setBookmarks).catch(() => {})
			void browserApi.getHistory().then(setHistory).catch(() => {})
			void browserApi.getDownloads().then(setDownloads).catch(() => {})
			void browserApi.getLogs().then(setConsoleLogs).catch(() => {})
			void browserApi.getNetworkErrors().then(setNetworkErrors).catch(() => {})

			setError(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to initialize browser')
		} finally {
			setLoading(false)
		}
	}, [isWide])

	useEffect(() => {
		void loadBrowserState()
	}, [loadBrowserState])

	// Auto-fit viewport to container when selectedPreset is 'responsive' (debounced to avoid thrashing/zooming oscillation)
	useEffect(() => {
		if (selectedPreset !== 'responsive' || !activeTabId) return

		const updateDimensions = () => {
			const container = containerRef.current
			if (!container) return
			const w = Math.floor(container.clientWidth) || (isWide ? 1280 : window.innerWidth)
			const h = Math.floor(container.clientHeight) || (isWide ? 800 : window.innerHeight - 150)
			if (w <= 0 || h <= 0) return

			// Avoid thrashing if dimensions changed by less than 20px (e.g. mobile address bar shifts)
			const last = lastAppliedViewportRef.current
			if (last && Math.abs(last.width - w) < 20 && Math.abs(last.height - h) < 30) {
				return
			}

			lastAppliedViewportRef.current = { width: w, height: h }

			const viewport: BrowserViewport = {
				width: w,
				height: h,
				deviceScaleFactor: 1,
				isMobile: !isWide,
				hasTouch: !isWide,
			}
			void browserApi.setViewport(activeTabId, viewport).catch(() => {})
		}

		if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
		resizeTimeoutRef.current = setTimeout(updateDimensions, 200)

		const observer = new ResizeObserver(() => {
			if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
			resizeTimeoutRef.current = setTimeout(updateDimensions, 300)
		})
		if (containerRef.current) observer.observe(containerRef.current)
		return () => {
			if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
			observer.disconnect()
		}
	}, [activeTabId, selectedPreset, isWide])

	// Update omnibox when active tab changes and not manually editing
	useEffect(() => {
		if (activeTab && !isEditingUrl) {
			setOmniboxInput(activeTab.url)
		}
	}, [activeTab, isEditingUrl])

	// Dedicated single WebSocket connection with auto-reconnect
	useEffect(() => {
		let isMounted = true
		let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
		let ws: WebSocket | null = null

		const connect = () => {
			if (!isMounted) return
			const wsUrl = browserApi.getWebSocketUrl()
			ws = new WebSocket(wsUrl)
			wsRef.current = ws

			ws.onopen = () => {
				setIsRunning(true)
				setError(null)
				if (activeTabIdRef.current && ws?.readyState === WebSocket.OPEN) {
					ws.send(
						JSON.stringify({
							type: 'subscribe',
							tabId: activeTabIdRef.current,
						} satisfies BrowserClientMessage),
					)
				}
			}

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data) as BrowserServerMessage

					if (msg.type === 'frame') {
						if (msg.tabId === activeTabIdRef.current) {
							renderFrame(msg)
						}
					} else if (msg.type === 'tabUpdated') {
						setTabs((prev) => {
							const exists = prev.some((t) => t.id === msg.tab.id)
							if (exists) {
								return prev.map((t) => (t.id === msg.tab.id ? msg.tab : t))
							}
							return [...prev, msg.tab]
						})
					} else if (msg.type === 'tabClosed') {
						setTabs((prev) => {
							const filtered = prev.filter((t) => t.id !== msg.tabId)
							if (activeTabIdRef.current === msg.tabId && filtered.length > 0) {
								const nextTab = filtered[filtered.length - 1]
								setActiveTabId(nextTab.id)
								setOmniboxInput(nextTab.url)
							}
							return filtered
						})
					} else if (msg.type === 'console') {
						setConsoleLogs((prev) => [msg.entry, ...prev.slice(0, 499)])
					} else if (msg.type === 'networkError') {
						setNetworkErrors((prev) => [msg.entry, ...prev.slice(0, 499)])
					} else if (msg.type === 'downloadUpdated') {
						setDownloads((prev) => {
							const idx = prev.findIndex((d) => d.id === msg.item.id)
							if (idx !== -1) {
								const copy = [...prev]
								copy[idx] = msg.item
								return copy
							}
							return [msg.item, ...prev]
						})
					} else if (msg.type === 'status') {
						setIsRunning(msg.isRunning)
						setIsRecovering(Boolean(msg.isRecovering))
						if (msg.activeTabId && msg.activeTabId !== activeTabIdRef.current) {
							setActiveTabId(msg.activeTabId)
						}
					}
				} catch {
					// ignore parse error
				}
			}

			ws.onclose = () => {
				if (!isMounted) return
				reconnectTimeout = setTimeout(connect, 2000)
			}

			ws.onerror = () => {
				if (ws?.readyState === WebSocket.OPEN) ws.close()
			}
		}

		connect()

		return () => {
			isMounted = false
			if (reconnectTimeout) clearTimeout(reconnectTimeout)
			if (ws) ws.close()
		}
	}, [renderFrame])

	// Synchronize subscription whenever activeTabId changes
	useEffect(() => {
		if (!activeTabId) return

		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(
				JSON.stringify({
					type: 'subscribe',
					tabId: activeTabId,
				} satisfies BrowserClientMessage),
			)
		}

		return () => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.send(
					JSON.stringify({
						type: 'unsubscribe',
						tabId: activeTabId,
					} satisfies BrowserClientMessage),
				)
			}
		}
	}, [activeTabId])

	// Tab operations
	const handleCreateTab = async (url?: string) => {
		try {
			const newTab = await browserApi.createTab({ url })
			setTabs((prev) => [...prev, newTab])
			setActiveTabId(newTab.id)
			setOmniboxInput(newTab.url)

			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.send(
					JSON.stringify({
						type: 'subscribe',
						tabId: newTab.id,
					} satisfies BrowserClientMessage),
				)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create tab')
		}
	}

	const handleSwitchTab = async (tabId: string) => {
		if (tabId === activeTabId) return
		try {
			const updated = await browserApi.switchTab(tabId)
			setActiveTabId(tabId)
			setOmniboxInput(updated.url)

			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.send(
					JSON.stringify({
						type: 'subscribe',
						tabId,
					} satisfies BrowserClientMessage),
				)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to switch tab')
		}
	}

	const handleCloseTab = async (e: React.MouseEvent, tabId: string) => {
		e.stopPropagation()
		try {
			await browserApi.closeTab(tabId)
			setTabs((prev) => {
				const filtered = prev.filter((t) => t.id !== tabId)
				if (activeTabId === tabId && filtered.length > 0) {
					setActiveTabId(filtered[0].id)
					setOmniboxInput(filtered[0].url)
				}
				return filtered
			})
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to close tab')
		}
	}

	const handleReopenClosedTab = async () => {
		try {
			const tab = await browserApi.reopenClosedTab()
			setTabs((prev) => [...prev, tab])
			setActiveTabId(tab.id)
		} catch {
			// no tabs to reopen
		}
	}

	// Omnibox submit
	const handleOmniboxSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!activeTabId || !omniboxInput.trim()) return

		setIsEditingUrl(false)
		try {
			const updated = await browserApi.navigate(activeTabId, omniboxInput.trim())
			setTabs((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Navigation failed')
		}
	}

	// Tab Actions
	const handleAction = async (action: 'back' | 'forward' | 'reload' | 'stop' | 'zoom_in' | 'zoom_out' | 'zoom_reset') => {
		if (!activeTabId) return
		try {
			const updated = await browserApi.performAction(activeTabId, action)
			setTabs((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
		} catch {
			// ignore
		}
	}

	// Bookmarks
	const handleToggleBookmark = async () => {
		if (!activeTab) return
		if (isBookmarked) {
			const b = bookmarks.find((item) => item.url === activeTab.url)
			if (b) {
				await browserApi.removeBookmark(b.id)
				setBookmarks((prev) => prev.filter((item) => item.id !== b.id))
			}
		} else {
			const newB = await browserApi.addBookmark(activeTab.title, activeTab.url, activeTab.favicon)
			setBookmarks((prev) => [newB, ...prev])
		}
	}

	// Preset resize
	const handleSelectPreset = async (presetId: DevicePresetId) => {
		setSelectedPreset(presetId)
		if (!activeTabId) return

		const preset = DEVICE_PRESETS.find((p) => p.id === presetId)
		if (!preset) return

		let width = preset.width
		let height = preset.height
		if (presetId === 'responsive' && containerRef.current) {
			width = containerRef.current.clientWidth || 1280
			height = containerRef.current.clientHeight || 800
		}

		const viewport: BrowserViewport = {
			width,
			height,
			isMobile: preset.isMobile,
			hasTouch: preset.hasTouch,
		}

		try {
			const updated = await browserApi.setViewport(activeTabId, viewport)
			setTabs((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
		} catch {
			// ignore
		}
	}

	// Find on page
	const handleFind = async (forward = true) => {
		if (!activeTabId || !findText.trim()) return
		try {
			const res = await browserApi.findOnPage(activeTabId, { text: findText, forward, findNext: true })
			setFindCount(res.matchCount)
			setFindOrdinal(res.activeMatchOrdinal)
		} catch {
			// ignore
		}
	}

	// Copy Helpers
	const showNotice = (msg: string) => {
		setCopiedNotice(msg)
		setTimeout(() => setCopiedNotice(null), 2500)
	}

	const handleCopyUrl = async () => {
		if (!activeTab) return
		try {
			await navigator.clipboard.writeText(activeTab.url)
			showNotice('URL copied to clipboard')
		} catch {
			showNotice('Failed to copy URL')
		}
	}

	const handlePasteClipboard = async () => {
		if (!activeTabId || wsRef.current?.readyState !== WebSocket.OPEN) return
		try {
			const text = await navigator.clipboard.readText()
			if (text) {
				wsRef.current.send(
					JSON.stringify({
						type: 'insertText',
						tabId: activeTabId,
						text,
					} satisfies BrowserClientMessage),
				)
				showNotice('Pasted text into page')
			} else {
				showNotice('Clipboard is empty')
			}
		} catch {
			showNotice('Clipboard access denied — use Ctrl+V or keyboard input')
		}
	}

	const handlePaste = (e: React.ClipboardEvent) => {
		if (!activeTabId || wsRef.current?.readyState !== WebSocket.OPEN) return
		const text = e.clipboardData.getData('text')
		if (text) {
			e.preventDefault()
			wsRef.current.send(
				JSON.stringify({
					type: 'insertText',
					tabId: activeTabId,
					text,
				} satisfies BrowserClientMessage),
			)
			showNotice('Pasted text into page')
		}
	}

	const handleScreenshot = async () => {
		if (!activeTabId) return
		try {
			const base64 = await browserApi.takeScreenshot(activeTabId)
			const a = document.createElement('a')
			a.href = `data:image/png;base64,${base64}`
			a.download = `screenshot-${Date.now()}.png`
			a.click()
			showNotice('Screenshot downloaded')
		} catch {
			showNotice('Screenshot failed')
		}
	}

	const handleAskAgentAboutPage = async () => {
		if (!activeTabId || !onSendToChat) return
		try {
			const ctx = await browserApi.getPageContext(activeTabId)
			const text = [
				`[Browser Context: ${ctx.title}]`,
				`URL: ${ctx.url}`,
				ctx.selection ? `\n> ${ctx.selection}` : '',
				ctx.textSummary ? `\n${ctx.textSummary}` : '',
				'\n---\nHow can I help with this page?',
			]
				.filter(Boolean)
				.join('\n')

			onSendToChat(text)
			showNotice('Page context sent to Agent Chat')
		} catch {
			showNotice('Failed to extract page context')
		}
	}

	// ==========================================
	// Input Dispatching (Pointer / Touch / Keys)
	// ==========================================

	const getCanvasCoordinates = (clientX: number, clientY: number) => {
		const canvas = canvasRef.current
		if (!canvas) return { x: 0, y: 0 }

		const rect = canvas.getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }

		const scaleX = canvas.width / rect.width
		const scaleY = canvas.height / rect.height

		return {
			x: Math.max(0, Math.min(canvas.width, Math.round((clientX - rect.left) * scaleX))),
			y: Math.max(0, Math.min(canvas.height, Math.round((clientY - rect.top) * scaleY))),
		}
	}

	const handlePointerDown = (e: React.MouseEvent) => {
		// Ignore simulated mouse events if touch was recently used
		if (touchTrackingRef.current || !activeTabId || wsRef.current?.readyState !== WebSocket.OPEN) return
		const { x, y } = getCanvasCoordinates(e.clientX, e.clientY)
		const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left'

		wsRef.current.send(
			JSON.stringify({
				type: 'pointer',
				tabId: activeTabId,
				eventType: 'mousedown',
				x,
				y,
				button,
			} satisfies BrowserClientMessage),
		)
	}

	const handlePointerUp = (e: React.MouseEvent) => {
		if (touchTrackingRef.current || !activeTabId || wsRef.current?.readyState !== WebSocket.OPEN) return
		const { x, y } = getCanvasCoordinates(e.clientX, e.clientY)
		const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left'

		wsRef.current.send(
			JSON.stringify({
				type: 'pointer',
				tabId: activeTabId,
				eventType: 'mouseup',
				x,
				y,
				button,
			} satisfies BrowserClientMessage),
		)
	}

	const handlePointerMove = (e: React.MouseEvent) => {
		if (touchTrackingRef.current || !activeTabId || wsRef.current?.readyState !== WebSocket.OPEN) return
		const { x, y } = getCanvasCoordinates(e.clientX, e.clientY)

		wsRef.current.send(
			JSON.stringify({
				type: 'pointer',
				tabId: activeTabId,
				eventType: 'mousemove',
				x,
				y,
			} satisfies BrowserClientMessage),
		)
	}

	// Mobile Touch Handling (Tap = Click, Swipe = Smooth Scroll)
	const handleTouchStart = (e: React.TouchEvent) => {
		if (!activeTabId || e.touches.length === 0) return
		const touch = e.touches[0]
		const coords = getCanvasCoordinates(touch.clientX, touch.clientY)

		touchTrackingRef.current = {
			startX: coords.x,
			startY: coords.y,
			startTime: Date.now(),
			lastClientX: touch.clientX,
			lastClientY: touch.clientY,
			isDragging: false,
		}
	}

	const handleTouchMove = (e: React.TouchEvent) => {
		if (!activeTabId || !touchTrackingRef.current || e.touches.length === 0) return
		const touch = e.touches[0]
		const tracking = touchTrackingRef.current
		const dx = touch.clientX - tracking.lastClientX
		const dy = touch.clientY - tracking.lastClientY

		if (!tracking.isDragging) {
			const totalDist = Math.hypot(touch.clientX - tracking.lastClientX, touch.clientY - tracking.lastClientY)
			if (totalDist > 6) {
				tracking.isDragging = true
			}
		}

		if (tracking.isDragging && wsRef.current?.readyState === WebSocket.OPEN) {
			// Convert swipe to smooth scroll deltas
			wsRef.current.send(
				JSON.stringify({
					type: 'scroll',
					tabId: activeTabId,
					x: tracking.startX,
					y: tracking.startY,
					deltaX: -dx * 2.5,
					deltaY: -dy * 2.5,
				} satisfies BrowserClientMessage),
			)
		}

		tracking.lastClientX = touch.clientX
		tracking.lastClientY = touch.clientY
	}

	const handleTouchEnd = () => {
		if (!activeTabId || !touchTrackingRef.current) return
		const tracking = touchTrackingRef.current
		const elapsed = Date.now() - tracking.startTime

		// Clean tap: Send immediate click (mousedown + mouseup) at canvas coordinates
		if (!tracking.isDragging && elapsed < 600 && wsRef.current?.readyState === WebSocket.OPEN) {
			const currentTab = activeTabId
			wsRef.current.send(
				JSON.stringify({
					type: 'pointer',
					tabId: currentTab,
					eventType: 'mousedown',
					x: tracking.startX,
					y: tracking.startY,
					button: 'left',
					clickCount: 1,
				} satisfies BrowserClientMessage),
			)

			setTimeout(() => {
				if (wsRef.current?.readyState === WebSocket.OPEN && activeTabIdRef.current === currentTab) {
					wsRef.current.send(
						JSON.stringify({
							type: 'pointer',
							tabId: currentTab,
							eventType: 'mouseup',
							x: tracking.startX,
							y: tracking.startY,
							button: 'left',
							clickCount: 1,
						} satisfies BrowserClientMessage),
					)
				}
			}, 40)
		}

		touchTrackingRef.current = null
	}

	const handleWheel = (e: React.WheelEvent) => {
		if (!activeTabId || wsRef.current?.readyState !== WebSocket.OPEN) return
		const { x, y } = getCanvasCoordinates(e.clientX, e.clientY)

		wsRef.current.send(
			JSON.stringify({
				type: 'scroll',
				tabId: activeTabId,
				x,
				y,
				deltaX: e.deltaX,
				deltaY: e.deltaY,
			} satisfies BrowserClientMessage),
		)
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!activeTabId || wsRef.current?.readyState !== WebSocket.OPEN) return

		// Allow Ctrl+F find shortcut
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
			e.preventDefault()
			setFindOpen(true)
			return
		}

		wsRef.current.send(
			JSON.stringify({
				type: 'key',
				tabId: activeTabId,
				eventType: 'keydown',
				key: e.key,
				code: e.code,
			} satisfies BrowserClientMessage),
		)
	}

	const handleKeyUp = (e: React.KeyboardEvent) => {
		if (!activeTabId || wsRef.current?.readyState !== WebSocket.OPEN) return

		wsRef.current.send(
			JSON.stringify({
				type: 'key',
				tabId: activeTabId,
				eventType: 'keyup',
				key: e.key,
				code: e.code,
			} satisfies BrowserClientMessage),
		)
	}

	const handleToggleKeyboard = () => {
		if (inputProxyRef.current) {
			inputProxyRef.current.focus()
			showNotice('Keyboard enabled — start typing')
		}
	}

	const handleProxyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!activeTabId || wsRef.current?.readyState !== WebSocket.OPEN) return
		const val = e.target.value
		if (val) {
			wsRef.current.send(
				JSON.stringify({
					type: 'insertText',
					tabId: activeTabId,
					text: val,
				} satisfies BrowserClientMessage),
			)
			e.target.value = ''
		}
	}

	const handleProxyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (!activeTabId || wsRef.current?.readyState !== WebSocket.OPEN) return
		if (e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
			wsRef.current.send(
				JSON.stringify({
					type: 'key',
					tabId: activeTabId,
					eventType: 'keydown',
					key: e.key,
					code: e.code,
				} satisfies BrowserClientMessage),
			)
			setTimeout(() => {
				if (wsRef.current?.readyState === WebSocket.OPEN && activeTabIdRef.current === activeTabId) {
					wsRef.current.send(
						JSON.stringify({
							type: 'key',
							tabId: activeTabId,
							eventType: 'keyup',
							key: e.key,
							code: e.code,
						} satisfies BrowserClientMessage),
					)
				}
			}, 30)
		}
	}

	const filteredLogs = consoleLogs.filter((l) => consoleFilter === 'all' || l.level === consoleFilter)
	const errorCount = consoleLogs.filter((l) => l.level === 'error').length + networkErrors.length

	return (
		<div
			className={`browser-view${isWide ? ' browser-view--wide' : ' browser-view--mobile'}`}
			tabIndex={0}
			onKeyDown={handleKeyDown}
			onKeyUp={handleKeyUp}
			onPaste={handlePaste}
		>
			{/* Notice popup */}
			{copiedNotice && <div className="browser-notice">{copiedNotice}</div>}

			{/* Error banner */}
			{error && (
				<div className="browser-error-banner">
					<span>{error}</span>
					<button type="button" onClick={() => setError(null)}>✕</button>
				</div>
			)}

			{/* Initial loading state */}
			{loading && (
				<div className="browser-loading-bar">
					<div className="browser-loading-bar__indeterminate" />
				</div>
			)}

			{/* Browser Top Chrome */}
			<div className="browser-chrome">
				{/* Tab Strip */}
				<div className="browser-tabs">
					<div className="browser-tabs__list">
						{tabs.map((tab) => {
							const isActive = tab.id === activeTabId
							return (
								<div
									key={tab.id}
									className={`browser-tab${isActive ? ' is-active' : ''}`}
									onClick={() => void handleSwitchTab(tab.id)}
									title={tab.title}
								>
									{tab.isLoading ? (
										<span className="browser-tab__spinner" />
									) : (
										<span className="browser-tab__favicon">🌐</span>
									)}
									<span className="browser-tab__title">{tab.title || 'New Tab'}</span>
									<button
										type="button"
										className="browser-tab__close"
										onClick={(e) => void handleCloseTab(e, tab.id)}
										aria-label="Close tab"
									>
										✕
									</button>
								</div>
							)
						})}
					</div>

					<button
						type="button"
						className="browser-tabs__add-btn"
						onClick={() => void handleCreateTab()}
						title="New Tab"
						aria-label="New Tab"
					>
						<IconPlus />
					</button>
				</div>

				{/* Navigation & Omnibox Bar */}
				<div className="browser-toolbar">
					<div className="browser-nav-buttons">
						<button
							type="button"
							className="browser-nav-btn"
							onClick={() => void handleAction('back')}
							title="Back"
							aria-label="Back"
						>
							<IconBack />
						</button>
						<button
							type="button"
							className="browser-nav-btn"
							onClick={() => void handleAction('forward')}
							title="Forward"
							aria-label="Forward"
						>
							<IconForward />
						</button>
						<button
							type="button"
							className="browser-nav-btn"
							onClick={() => void handleAction(activeTab?.isLoading ? 'stop' : 'reload')}
							title={activeTab?.isLoading ? 'Stop' : 'Reload'}
							aria-label="Reload or stop"
						>
							{activeTab?.isLoading ? <IconClose /> : <IconRefresh />}
						</button>
						<button
							type="button"
							className="browser-nav-btn"
							onClick={() => void handleCreateTab('https://github.com')}
							title="Home"
							aria-label="Home"
						>
							<IconHome />
						</button>
					</div>

					{/* Omnibox */}
					<form className="browser-omnibox" onSubmit={handleOmniboxSubmit}>
						<span className="browser-omnibox__ssl" title={activeTab?.url.startsWith('https://') ? 'Secure' : 'Insecure'}>
							{activeTab?.url.startsWith('https://') ? <IconLock /> : <IconUnlock />}
						</span>
						<input
							type="text"
							className="browser-omnibox__input"
							value={omniboxInput}
							onChange={(e) => setOmniboxInput(e.target.value)}
							onFocus={() => setIsEditingUrl(true)}
							onBlur={() => setIsEditingUrl(false)}
							placeholder="Search or enter web / localhost address..."
						/>
						{activeTab?.zoomLevel && activeTab.zoomLevel !== 1.0 && (
							<span className="browser-omnibox__zoom-badge" onClick={() => void handleAction('zoom_reset')}>
								{Math.round(activeTab.zoomLevel * 100)}%
							</span>
						)}
						<button
							type="button"
							className="browser-omnibox__btn"
							onClick={handleCopyUrl}
							title="Copy URL"
							aria-label="Copy URL"
						>
							<IconCopy />
						</button>
						<button
							type="button"
							className={`browser-omnibox__btn${isBookmarked ? ' is-bookmarked' : ''}`}
							onClick={() => void handleToggleBookmark()}
							title={isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
							aria-label="Bookmark"
						>
							{isBookmarked ? <IconStarFilled /> : <IconStar />}
						</button>
					</form>

					{!isRunning && !loading && (
						<span className="browser-offline-badge" title="Chromium engine initializing or stopped">
							Offline
						</span>
					)}

					{/* Viewport Presets & Menu Actions */}
					<div className="browser-toolbar-actions">
						<select
							className="browser-preset-select"
							value={selectedPreset}
							onChange={(e) => void handleSelectPreset(e.target.value as DevicePresetId)}
							title="Device Viewport Preset"
						>
							{DEVICE_PRESETS.map((p) => (
								<option key={p.id} value={p.id}>
									{p.label}
								</option>
							))}
						</select>

						<button
							type="button"
							className="browser-nav-btn"
							onClick={() => void handlePasteClipboard()}
							title="Paste clipboard text into page"
							aria-label="Paste clipboard text"
						>
							<IconPaste />
						</button>

						<button
							type="button"
							className="browser-nav-btn"
							onClick={handleToggleKeyboard}
							title="Toggle On-Screen Keyboard"
							aria-label="Toggle Keyboard"
						>
							<IconKeyboard />
						</button>

						<button
							type="button"
							className="browser-nav-btn"
							onClick={() => setFindOpen(!findOpen)}
							title="Find on page (Ctrl+F)"
							aria-label="Find on page"
						>
							<IconSearch />
						</button>

						{/* Browser Menu */}
						<div className="browser-menu-container" ref={menuRef}>
							<button
								type="button"
								className={`browser-nav-btn${menuOpen ? ' is-active' : ''}`}
								onClick={() => setMenuOpen(!menuOpen)}
								title="Browser Menu"
								aria-label="Browser Menu"
							>
								⋮
								{errorCount > 0 && <span className="browser-menu-error-dot" />}
							</button>

							{menuOpen && (
								<div className="browser-dropdown-menu">
									<button
										type="button"
										className="browser-dropdown-item"
										onClick={() => {
											void handleReopenClosedTab()
											setMenuOpen(false)
										}}
									>
										<span>Reopen Closed Tab</span>
									</button>
									<button
										type="button"
										className="browser-dropdown-item"
										onClick={() => {
											void handlePasteClipboard()
											setMenuOpen(false)
										}}
									>
										<IconPaste />
										<span>Paste into Page</span>
									</button>
									<div className="browser-dropdown-divider" />
									<button
										type="button"
										className="browser-dropdown-item"
										onClick={() => {
											setActiveDrawer('bookmarks')
											setMenuOpen(false)
										}}
									>
										<IconStar />
										<span>Bookmarks</span>
										<span className="browser-dropdown-badge">{bookmarks.length}</span>
									</button>
									<button
										type="button"
										className="browser-dropdown-item"
										onClick={() => {
											setActiveDrawer('history')
											setMenuOpen(false)
										}}
									>
										<IconHistory />
										<span>History</span>
									</button>
									<button
										type="button"
										className="browser-dropdown-item"
										onClick={() => {
											setActiveDrawer('downloads')
											setMenuOpen(false)
										}}
									>
										<IconDownload />
										<span>Downloads</span>
										{downloads.length > 0 && <span className="browser-dropdown-badge">{downloads.length}</span>}
									</button>
									<div className="browser-dropdown-divider" />
									<button
										type="button"
										className="browser-dropdown-item"
										onClick={() => {
											setActiveDrawer('console')
											setMenuOpen(false)
										}}
									>
										<IconAlertCircle />
										<span>Console Logs</span>
										{consoleLogs.length > 0 && <span className="browser-dropdown-badge">{consoleLogs.length}</span>}
									</button>
									<button
										type="button"
										className="browser-dropdown-item"
										onClick={() => {
											setActiveDrawer('network')
											setMenuOpen(false)
										}}
									>
										<IconAlertTriangle />
										<span>Network Errors</span>
										{networkErrors.length > 0 && <span className="browser-dropdown-badge">{networkErrors.length}</span>}
									</button>
									<div className="browser-dropdown-divider" />
									<button
										type="button"
										className="browser-dropdown-item"
										onClick={() => {
											void handleAskAgentAboutPage()
											setMenuOpen(false)
										}}
									>
										<span>✨ Ask Agent About Page</span>
									</button>
									<button
										type="button"
										className="browser-dropdown-item"
										onClick={() => {
											void handleScreenshot()
											setMenuOpen(false)
										}}
									>
										<IconCamera />
										<span>Take Screenshot</span>
									</button>
									<div className="browser-dropdown-divider" />
									<div className="browser-dropdown-zoom-row">
										<span>Zoom</span>
										<button type="button" onClick={() => void handleAction('zoom_out')}>-</button>
										<button type="button" onClick={() => void handleAction('zoom_reset')}>100%</button>
										<button type="button" onClick={() => void handleAction('zoom_in')}>+</button>
									</div>
								</div>
							)}
						</div>

						{/* Maximize Toggle (wide layout) */}
						{onToggleMaximize && (
							<button
								type="button"
								className="browser-nav-btn"
								onClick={onToggleMaximize}
								title={isMaximized ? 'Restore split' : 'Maximize browser'}
								aria-label="Maximize toggle"
							>
								{isMaximized ? <IconMinimize /> : <IconMaximize />}
							</button>
						)}
					</div>
				</div>

				{/* Find on Page Bar */}
				{findOpen && (
					<div className="browser-find-bar">
						<input
							type="text"
							className="browser-find-input"
							value={findText}
							onChange={(e) => setFindText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') void handleFind(!e.shiftKey)
							}}
							placeholder="Find in page..."
							autoFocus
						/>
						{findCount !== null && (
							<span className="browser-find-count">
								{findCount > 0 ? `${findOrdinal ?? 1}/${findCount}` : 'No matches'}
							</span>
						)}
						<button type="button" className="browser-find-btn" onClick={() => void handleFind(false)}>▲</button>
						<button type="button" className="browser-find-btn" onClick={() => void handleFind(true)}>▼</button>
						<button type="button" className="browser-find-btn" onClick={() => setFindOpen(false)}>✕</button>
					</div>
				)}
			</div>

			{/* Main Browser Viewport */}
			<div className="browser-viewport-container" ref={containerRef}>
				{isRecovering && (
					<div className="browser-status-overlay">
						<span className="browser-tab__spinner" />
						<span>Chromium engine recovering...</span>
					</div>
				)}

				<canvas
					ref={canvasRef}
					className="browser-canvas"
					onMouseDown={handlePointerDown}
					onMouseUp={handlePointerUp}
					onMouseMove={handlePointerMove}
					onTouchStart={handleTouchStart}
					onTouchMove={handleTouchMove}
					onTouchEnd={handleTouchEnd}
					onWheel={handleWheel}
				/>

				{/* Invisible input proxy for mobile virtual keyboard entry */}
				<input
					ref={inputProxyRef}
					type="text"
					className="browser-input-proxy"
					onChange={handleProxyInput}
					onKeyDown={handleProxyKeyDown}
					aria-hidden="true"
				/>
			</div>

			{/* Bottom Diagnostics / Modals Drawer */}
			{activeDrawer !== 'none' && (
				<div className="browser-drawer">
					<div className="browser-drawer__header">
						<span className="browser-drawer__title">
							{activeDrawer === 'console' && 'Console Logs'}
							{activeDrawer === 'network' && 'Network Errors'}
							{activeDrawer === 'bookmarks' && 'Bookmarks'}
							{activeDrawer === 'history' && 'Browsing History'}
							{activeDrawer === 'downloads' && 'Downloads'}
						</span>
						<div className="browser-drawer__controls">
							{activeDrawer === 'console' && (
								<>
									<div className="browser-filter-chips">
										{(['all', 'error', 'warn', 'info', 'log'] as const).map((f) => (
											<button
												key={f}
												type="button"
												className={`browser-filter-chip${consoleFilter === f ? ' is-active' : ''}`}
												onClick={() => setConsoleFilter(f)}
											>
												{f}
											</button>
										))}
									</div>
									<button
										type="button"
										className="browser-drawer__clear-btn"
										onClick={() => void browserApi.clearLogs().then(() => setConsoleLogs([]))}
									>
										Clear
									</button>
								</>
							)}
							{activeDrawer === 'network' && (
								<button
									type="button"
									className="browser-drawer__clear-btn"
									onClick={() => void browserApi.clearNetworkErrors().then(() => setNetworkErrors([]))}
								>
									Clear
								</button>
							)}
							{activeDrawer === 'history' && (
								<button
									type="button"
									className="browser-drawer__clear-btn"
									onClick={() => void browserApi.clearHistory().then(() => setHistory([]))}
								>
									Clear History
								</button>
							)}
							<button
								type="button"
								className="browser-drawer__close-btn"
								onClick={() => setActiveDrawer('none')}
							>
								✕
							</button>
						</div>
					</div>

					<div className="browser-drawer__body">
						{/* Console Logs */}
						{activeDrawer === 'console' && (
							<div className="browser-logs-list">
								{filteredLogs.length === 0 ? (
									<div className="browser-empty-state">No console logs recorded</div>
								) : (
									filteredLogs.map((log) => (
										<div key={log.id} className={`browser-log-entry browser-log-entry--${log.level}`}>
											<span className="browser-log-level">[{log.level.toUpperCase()}]</span>
											<span className="browser-log-text">{log.text}</span>
											{log.location && <span className="browser-log-loc">{log.location}</span>}
										</div>
									))
								)}
							</div>
						)}

						{/* Network Errors */}
						{activeDrawer === 'network' && (
							<div className="browser-logs-list">
								{networkErrors.length === 0 ? (
									<div className="browser-empty-state">No network errors captured</div>
								) : (
									networkErrors.map((err) => (
										<div key={err.id} className="browser-log-entry browser-log-entry--error">
											<span className="browser-log-level">[{err.method}]</span>
											<span className="browser-log-text">{err.url}</span>
											<span className="browser-log-loc">{err.errorText}</span>
										</div>
									))
								)}
							</div>
						)}

						{/* Bookmarks */}
						{activeDrawer === 'bookmarks' && (
							<div className="browser-items-list">
								{bookmarks.length === 0 ? (
									<div className="browser-empty-state">No bookmarks saved yet</div>
								) : (
									bookmarks.map((b) => (
										<div key={b.id} className="browser-item-row" onClick={() => void handleCreateTab(b.url)}>
											<span className="browser-item-icon">⭐</span>
											<div className="browser-item-content">
												<span className="browser-item-title">{b.title}</span>
												<span className="browser-item-url">{b.url}</span>
											</div>
											<button
												type="button"
												className="browser-item-del-btn"
												onClick={(e) => {
													e.stopPropagation()
													void browserApi.removeBookmark(b.id).then(() => {
														setBookmarks((prev) => prev.filter((item) => item.id !== b.id))
													})
												}}
											>
												✕
											</button>
										</div>
									))
								)}
							</div>
						)}

						{/* History */}
						{activeDrawer === 'history' && (
							<div className="browser-items-list">
								{history.length === 0 ? (
									<div className="browser-empty-state">No browsing history yet</div>
								) : (
									history.map((h) => (
										<div key={h.id} className="browser-item-row" onClick={() => void handleCreateTab(h.url)}>
											<span className="browser-item-icon">🕒</span>
											<div className="browser-item-content">
												<span className="browser-item-title">{h.title}</span>
												<span className="browser-item-url">{h.url}</span>
											</div>
											<span className="browser-item-time">
												{new Date(h.visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
											</span>
										</div>
									))
								)}
							</div>
						)}

						{/* Downloads */}
						{activeDrawer === 'downloads' && (
							<div className="browser-items-list">
								{downloads.length === 0 ? (
									<div className="browser-empty-state">No downloaded files</div>
								) : (
									downloads.map((d) => (
										<div key={d.id} className="browser-item-row">
											<span className="browser-item-icon">📥</span>
											<div className="browser-item-content">
												<span className="browser-item-title">{d.filename}</span>
												<span className="browser-item-url">{d.localPath}</span>
											</div>
											<span className={`browser-download-badge browser-download-badge--${d.state}`}>
												{d.state}
											</span>
											{onOpenInEditor && d.state === 'completed' && (
												<button
													type="button"
													className="browser-item-action-btn"
													onClick={() => onOpenInEditor(d.localPath)}
												>
													Open in Editor
												</button>
											)}
										</div>
									))
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

