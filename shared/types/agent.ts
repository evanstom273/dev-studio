export type TokenUsage = {
	inputTokens?: number
	outputTokens?: number
	thinkingTokens?: number
	totalTokens?: number
	cacheReadTokens?: number
}

export type TurnToolEntry = {
	name: string
	label: string
	durationMs?: number
}

export type AgentMode = 'agent' | 'ask' | 'plan'

export type MessageRole = 'user' | 'agent' | 'system'

export type AgentActivityType =
	| 'status'
	| 'read'
	| 'search'
	| 'edit'
	| 'command'
	| 'git'
	| 'tool'
	| 'error'

export type AgentActivityStatus = 'running' | 'completed' | 'failed'

export type AgentActivityDetail = {
	filePath?: string
	files?: string[]
	query?: string
	directory?: string
	command?: string
	output?: string
	error?: string
	exitCode?: number
	diff?: string
	additions?: number
	deletions?: number
	matchCount?: number
	summary?: string
	action?: string
	instruction?: string
	[key: string]: unknown
}

export type AgentActivityItem = {
	id: string
	type: AgentActivityType
	status: AgentActivityStatus
	title: string
	detail?: AgentActivityDetail
	startedAt: number
	completedAt?: number
	durationMs?: number
	toolName?: string
}

export type AgentTimelineEntry =
	| { id: string; kind: 'commentary'; content: string; createdAt: number }
	| { id: string; kind: 'activity'; activityId: string; createdAt: number }

export type ActivityTimelineItem = {
	id: string
	kind: 'activity_timeline'
	turnId?: string
	status: 'running' | 'complete' | 'error'
	startedAt: number
	completedAt?: number
	durationMs?: number
	activities: AgentActivityItem[]
	entries?: AgentTimelineEntry[]
	usage?: TokenUsage
	tokensPerSecond?: number
	timestamp?: string
}

export type ConversationItem =
	| {
			id: string
			kind: 'message'
			role: MessageRole
			content: string
			timestamp: string
			mode?: AgentMode
	  }
	| {
			id: string
			kind: 'activity'
			status: 'running' | 'complete' | 'error'
			label: string
			timestamp: string
			toolName?: string
	  }
	| ActivityTimelineItem

export type AttachmentInfo = {
	id: string
	name: string
	size: number
	contentType: string
	relativePath?: string
	textContent?: string
	previewUrl?: string
}

export type AgentProviderId = 'antigravity' | 'codex'

export type ReasoningEffortOption = {
	effort: string
	label: string
	description?: string
}

export type SpeedOption = {
	tier: string
	label: string
	description?: string
}

export type AgentModelDefinition = {
	id: string
	name: string
	providerId: AgentProviderId
	providerName: string
	description?: string
	isDefault?: boolean
	supportedReasoningEfforts?: ReasoningEffortOption[]
	defaultReasoningEffort?: string
	supportedSpeedTiers?: SpeedOption[]
	defaultSpeedTier?: string
}

export type ProviderStatusInfo = {
	id: AgentProviderId
	name: string
	status: 'ready' | 'not_installed' | 'not_authenticated' | 'error'
	available: boolean
	authenticated?: boolean
	version?: string
	message?: string
	models: AgentModelDefinition[]
}

export type AvailableModelsResponse = {
	models: string[]
	modelDefinitions?: AgentModelDefinition[]
	providers?: ProviderStatusInfo[]
	currentModel?: string
}

export type AgentSession = {
	projectId: string
	conversationId: string | null
	codexThreadId?: string | null
	activeProvider?: AgentProviderId
	mode: AgentMode
	model?: string
	reasoningEffort?: string
	speed?: string
	items: ConversationItem[]
	updatedAt: string
}

export type SendMessageRequest = {
	projectId: string
	content: string
	mode?: AgentMode
	model?: string
	reasoningEffort?: string
	speed?: string
	attachments?: AttachmentInfo[]
}

export type UploadAttachmentRequest = {
	projectId: string
	filename: string
	contentType: string
	base64: string
}

export type UploadAttachmentResponse = {
	filename: string
	relativePath: string
	size: number
	contentType: string
}

export type StopGenerationRequest = {
	projectId: string
}

export type StopGenerationResponse = {
	stopped: boolean
}

export type PermissionRequest = {
	id: string
	projectId: string
	toolName: string
	description: string
	parameters: Record<string, unknown>
	createdAt: string
	status: 'pending' | 'approved' | 'denied' | 'expired'
}

export type StreamEvent =
	| { type: 'message_delta'; content: string }
	| { type: 'commentary_delta'; content: string }
	| {
			type: 'turn_status'
			status: 'running' | 'complete'
			label: string
			durationMs?: number
			usage?: TokenUsage
			tokensPerSecond?: number
			tool?: TurnToolEntry
	  }
	| { type: 'activity'; status: 'running' | 'complete' | 'error'; label: string; toolName?: string }
	| { type: 'activity_start'; activity: AgentActivityItem }
	| { type: 'activity_complete'; activity: AgentActivityItem }
	| { type: 'permission_request'; permission: PermissionRequest }
	| { type: 'done'; conversationId: string; status: string; durationMs?: number; usage?: TokenUsage; tokensPerSecond?: number }
	| { type: 'error'; message: string }

export type BackendHealth = {
	status: 'ok' | 'degraded' | 'error'
	version: string
	agy: ToolStatus
	git: ToolStatus
	github: ToolStatus
	uptime: number
}

export type ToolStatus = {
	available: boolean
	path?: string
	version?: string
	authenticated?: boolean
	message?: string
}

export type RunCommandRequest = {
	projectId: string
	command: string
	label?: string
}

export type RunCommandResult = {
	exitCode: number
	stdout: string
	stderr: string
	durationMs: number
}
