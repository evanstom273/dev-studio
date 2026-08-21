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

export type AgentSession = {
	projectId: string
	conversationId: string | null
	mode: AgentMode
	items: ConversationItem[]
	updatedAt: string
}

export type SendMessageRequest = {
	projectId: string
	content: string
	mode?: AgentMode
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
	| { type: 'activity'; status: 'running' | 'complete' | 'error'; label: string; toolName?: string }
	| { type: 'permission_request'; permission: PermissionRequest }
	| { type: 'done'; conversationId: string; status: string }
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
