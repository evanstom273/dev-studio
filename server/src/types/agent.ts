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

export type AttachmentInfo = {
	id: string
	name: string
	size: number
	contentType: string
	relativePath?: string
	textContent?: string
	previewUrl?: string
}

export type AvailableModelsResponse = {
	models: string[]
	currentModel?: string
}

export type AgentSession = {
	projectId: string
	conversationId: string | null
	mode: AgentMode
	model?: string
	items: ConversationItem[]
	updatedAt: string
}

export type SendMessageRequest = {
	projectId: string
	content: string
	mode?: AgentMode
	model?: string
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
