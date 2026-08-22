export type DevicePresetId =
	| 'responsive'
	| 'folded_phone'
	| 'pixel_fold_unfolded'
	| 'tablet'
	| 'desktop'
	| 'custom'

export type DevicePreset = {
	id: DevicePresetId
	label: string
	width: number
	height: number
	deviceScaleFactor?: number
	isMobile?: boolean
	hasTouch?: boolean
}

export type BrowserViewport = {
	width: number
	height: number
	deviceScaleFactor?: number
	isMobile?: boolean
	hasTouch?: boolean
	isLandscape?: boolean
}

export type BrowserTab = {
	id: string
	title: string
	url: string
	favicon?: string
	isLoading: boolean
	canGoBack: boolean
	canGoForward: boolean
	zoomLevel: number
	viewport: BrowserViewport
	createdAt: number
	updatedAt: number
}

export type BrowserSessionState = {
	tabs: BrowserTab[]
	activeTabId: string | null
	isRunning: boolean
	isRecovering?: boolean
	launchError?: string | null
	installHint?: string | null
}

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error'

export type ConsoleEntry = {
	id: string
	tabId: string
	level: ConsoleLevel
	text: string
	timestamp: number
	location?: string
}

export type NetworkErrorEntry = {
	id: string
	tabId: string
	url: string
	method: string
	status?: number
	errorText: string
	timestamp: number
}

export type BookmarkEntry = {
	id: string
	title: string
	url: string
	favicon?: string
	createdAt: number
}

export type HistoryEntry = {
	id: string
	title: string
	url: string
	favicon?: string
	visitedAt: number
}

export type DownloadState = 'in_progress' | 'completed' | 'failed' | 'cancelled'

export type DownloadItem = {
	id: string
	filename: string
	url: string
	state: DownloadState
	totalBytes?: number
	receivedBytes?: number
	localPath: string
	suggestedFilename?: string
	createdAt: number
	error?: string
}

export type PageContextInfo = {
	title: string
	url: string
	selection?: string
	textSummary?: string
	screenshotBase64?: string
}

export type NavigateRequest = {
	urlOrQuery: string
}

export type CreateTabRequest = {
	url?: string
	viewport?: BrowserViewport
}

export type TabActionRequest = {
	action: 'back' | 'forward' | 'reload' | 'stop' | 'zoom_in' | 'zoom_out' | 'zoom_reset'
	zoomLevel?: number
}

export type FindOnPageRequest = {
	text: string
	forward?: boolean
	findNext?: boolean
}

export type FindOnPageResult = {
	matchCount: number
	activeMatchOrdinal: number
}

// WebSocket message contracts

export type BrowserPointerMessage = {
	type: 'pointer'
	tabId: string
	eventType: 'mousedown' | 'mouseup' | 'mousemove'
	x: number
	y: number
	button?: 'left' | 'middle' | 'right'
	clickCount?: number
}

export type BrowserTouchPoint = {
	x: number
	y: number
	id: number
	radiusX?: number
	radiusY?: number
	force?: number
}

export type BrowserTouchMessage = {
	type: 'touch'
	tabId: string
	eventType: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel'
	points: BrowserTouchPoint[]
}

export type BrowserScrollMessage = {
	type: 'scroll'
	tabId: string
	x: number
	y: number
	deltaX: number
	deltaY: number
}

export type BrowserKeyMessage = {
	type: 'key'
	tabId: string
	eventType: 'keydown' | 'keyup' | 'rawKeyDown' | 'char'
	key: string
	code?: string
	text?: string
	keyCode?: number
	modifiers?: number
}

export type BrowserInsertTextMessage = {
	type: 'insertText'
	tabId: string
	text: string
}

export type BrowserResizeMessage = {
	type: 'resize'
	tabId: string
	viewport: BrowserViewport
}

export type BrowserSubscribeMessage = {
	type: 'subscribe'
	tabId: string
	viewport?: BrowserViewport
}

export type BrowserUnsubscribeMessage = {
	type: 'unsubscribe'
	tabId: string
}

export type BrowserAckFrameMessage = {
	type: 'ackFrame'
	tabId: string
	sessionId?: number
}

export type BrowserPauseMessage = {
	type: 'pause'
}

export type BrowserResumeMessage = {
	type: 'resume'
}

export type BrowserClientMessage =
	| BrowserSubscribeMessage
	| BrowserUnsubscribeMessage
	| BrowserPointerMessage
	| BrowserTouchMessage
	| BrowserScrollMessage
	| BrowserKeyMessage
	| BrowserInsertTextMessage
	| BrowserResizeMessage
	| BrowserAckFrameMessage
	| BrowserPauseMessage
	| BrowserResumeMessage

export type BrowserFrameMetadata = {
	offsetTop: number
	pageScaleFactor: number
	deviceWidth: number
	deviceHeight: number
	scrollOffsetX: number
	scrollOffsetY: number
	timestamp?: number
}

export type BrowserFrameMessage = {
	type: 'frame'
	tabId: string
	data: string
	metadata?: BrowserFrameMetadata
	sessionId?: number
}

export type BrowserTabUpdatedMessage = {
	type: 'tabUpdated'
	tab: BrowserTab
}

export type BrowserTabClosedMessage = {
	type: 'tabClosed'
	tabId: string
}

export type BrowserConsoleMessage = {
	type: 'console'
	entry: ConsoleEntry
}

export type BrowserNetworkErrorMessage = {
	type: 'networkError'
	entry: NetworkErrorEntry
}

export type BrowserDownloadUpdatedMessage = {
	type: 'downloadUpdated'
	item: DownloadItem
}

export type BrowserErrorMessage = {
	type: 'error'
	message: string
	code?: string
}

export type BrowserStatusMessage = {
	type: 'status'
	isRunning: boolean
	isRecovering?: boolean
	activeTabId: string | null
	launchError?: string | null
	installHint?: string | null
}

export type BrowserServerMessage =
	| BrowserFrameMessage
	| BrowserTabUpdatedMessage
	| BrowserTabClosedMessage
	| BrowserConsoleMessage
	| BrowserNetworkErrorMessage
	| BrowserDownloadUpdatedMessage
	| BrowserErrorMessage
	| BrowserStatusMessage

