import type {
	ActivityTimelineItem,
	AgentMode,
	AgentModelDefinition,
	AgentProviderId,
	ConversationItem,
	ProviderStatusInfo,
	StreamEvent,
} from '../../types/agent.js'

export type SessionTurnContext = {
	sessionItems?: ConversationItem[]
	recentMessagesSummary?: string
	isProviderSwitch?: boolean
	isCodexThreadReset?: boolean
	previousProvider?: AgentProviderId
	conversationId?: string | null
	codexThreadId?: string | null
	reasoningEffort?: string
	speed?: string
}

export type TurnExecutionResult = {
	agentContent: string
	conversationId?: string
	codexThreadId?: string
	failed: boolean
	timeline?: ActivityTimelineItem
}

export interface AgentProvider {
	readonly id: AgentProviderId
	readonly displayName: string

	init(): Promise<void>
	getStatus(refresh?: boolean): Promise<ProviderStatusInfo>
	getModels(): Promise<AgentModelDefinition[]>
	ownsModel(modelId: string): boolean

	runTurn(
		projectPath: string,
		projectId: string,
		content: string,
		mode: AgentMode,
		model: string | undefined,
		context: SessionTurnContext,
		onEvent: (event: StreamEvent) => void,
	): Promise<TurnExecutionResult>

	stopTurn(projectId: string): boolean
	resetSession(projectId: string): void
}

