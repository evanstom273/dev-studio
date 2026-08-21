export type MessageRole = 'user' | 'agent'

export type ConversationItem =
	| {
			id: string
			kind: 'message'
			role: MessageRole
			content: string
			timestamp: string
	  }
	| {
			id: string
			kind: 'activity'
			status: 'running' | 'complete' | 'error'
			label: string
			timestamp: string
	  }

export type AgentSession = {
	projectId: string
	items: ConversationItem[]
}

export type SendMessageRequest = {
	projectId: string
	content: string
}

export type SendMessageResponse = {
	messageId: string
}
