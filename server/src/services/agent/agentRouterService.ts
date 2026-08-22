import { randomUUID } from 'node:crypto'
import type {
	AgentMode,
	AgentModelDefinition,
	AgentProviderId,
	AvailableModelsResponse,
	ConversationItem,
	ProviderStatusInfo,
	StreamEvent,
} from '../../types/agent.js'
import type { SessionStore } from '../../store.js'
import type { AgentProvider, SessionTurnContext, TurnExecutionResult } from './agentProvider.js'
import type { AntigravityProvider } from './antigravityProvider.js'
import type { CodexProvider } from './codexProvider.js'

export class AgentRouterService {
	private providers = new Map<AgentProviderId, AgentProvider>()
	private activeTurnProvider = new Map<string, AgentProviderId>()

	constructor(
		private sessions: SessionStore,
		antigravity: AntigravityProvider,
		codex: CodexProvider,
	) {
		this.providers.set('antigravity', antigravity)
		this.providers.set('codex', codex)
	}

	async init(): Promise<void> {
		for (const provider of this.providers.values()) {
			try {
				await provider.init()
			} catch (err) {
				console.error(`Failed to initialize provider ${provider.id}:`, err)
			}
		}
	}

	getProvider(id: AgentProviderId): AgentProvider | undefined {
		return this.providers.get(id)
	}

	async getProviderStatuses(): Promise<ProviderStatusInfo[]> {
		const statuses: ProviderStatusInfo[] = []
		for (const provider of this.providers.values()) {
			try {
				statuses.push(await provider.getStatus())
			} catch (err) {
				statuses.push({
					id: provider.id,
					name: provider.displayName,
					status: 'error',
					available: false,
					authenticated: false,
					message: err instanceof Error ? err.message : 'Status check failed',
					models: [],
				})
			}
		}
		return statuses
	}

	async getAvailableModels(): Promise<AvailableModelsResponse> {
		const allDefinitions: AgentModelDefinition[] = []
		const allModelIds: string[] = []

		for (const provider of this.providers.values()) {
			try {
				const models = await provider.getModels()
				for (const m of models) {
					allDefinitions.push(m)
					if (!allModelIds.includes(m.id)) {
						allModelIds.push(m.id)
					}
				}
			} catch {
				// Provider failed to list models; continue
			}
		}

		return {
			models: allModelIds,
			modelDefinitions: allDefinitions,
		}
	}

	resolveProvider(modelId?: string, currentProviderId?: AgentProviderId): AgentProvider {
		if (modelId) {
			for (const provider of this.providers.values()) {
				if (provider.ownsModel(modelId)) {
					return provider
				}
			}
		}

		if (currentProviderId && this.providers.has(currentProviderId)) {
			return this.providers.get(currentProviderId)!
		}

		return this.providers.get('antigravity')!
	}

	private extractConversationSummary(items: ConversationItem[], maxTurns = 6): string {
		const messages: string[] = []
		const relevant = items
			.filter((item): item is Extract<ConversationItem, { kind: 'message' }> => item.kind === 'message')
			.slice(-maxTurns)

		for (const item of relevant) {
			const prefix = item.role === 'user' ? 'User' : 'Assistant'
			const content = item.content.trim().slice(0, 500)
			messages.push(`${prefix}: ${content}`)
		}

		return messages.join('\n\n')
	}

	async runPrompt(
		projectPath: string,
		projectId: string,
		content: string,
		mode: AgentMode,
		model: string | undefined,
		onEvent: (event: StreamEvent) => void,
	): Promise<void> {
		const session = await this.sessions.getOrCreate(projectId)
		const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

		const userItem: ConversationItem = {
			id: randomUUID(),
			kind: 'message',
			role: 'user',
			content,
			timestamp: now,
			mode,
		}
		session.items.push(userItem)
		session.mode = mode
		if (model) {
			session.model = model
		}
		await this.sessions.save(session)

		const targetProvider = this.resolveProvider(model || session.model, session.activeProvider)
		const isProviderSwitch = Boolean(session.activeProvider && session.activeProvider !== targetProvider.id)
		const previousProvider = session.activeProvider

		this.activeTurnProvider.set(projectId, targetProvider.id)

		const context: SessionTurnContext = {
			sessionItems: session.items,
			recentMessagesSummary: isProviderSwitch ? this.extractConversationSummary(session.items) : undefined,
			isProviderSwitch,
			previousProvider,
			conversationId: session.conversationId,
			codexThreadId: session.codexThreadId,
		}

		onEvent({ type: 'turn_status', status: 'running', label: 'Thinking…' })

		let turnResult: TurnExecutionResult
		try {
			turnResult = await targetProvider.runTurn(
				projectPath,
				projectId,
				content,
				mode,
				model || session.model,
				context,
				onEvent,
			)
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Turn execution failed'
			onEvent({ type: 'error', message })
			turnResult = {
				agentContent: '',
				failed: true,
			}
		} finally {
			this.activeTurnProvider.delete(projectId)
		}

		session.activeProvider = targetProvider.id

		if (turnResult.failed) {
			if (targetProvider.id === 'antigravity') {
				session.conversationId = null
			}
		} else {
			if (turnResult.conversationId) {
				session.conversationId = turnResult.conversationId
			}
			if (turnResult.codexThreadId) {
				session.codexThreadId = turnResult.codexThreadId
			}
		}

		if (turnResult.timeline) {
			turnResult.timeline.status = turnResult.failed ? 'error' : 'complete'
			turnResult.timeline.completedAt = Date.now()
			turnResult.timeline.durationMs = turnResult.timeline.completedAt - turnResult.timeline.startedAt
			if (turnResult.timeline.activities.length > 0) {
				session.items.push(turnResult.timeline)
			}
		}

		if (turnResult.agentContent?.trim()) {
			const agentItem: ConversationItem = {
				id: randomUUID(),
				kind: 'message',
				role: 'agent',
				content: turnResult.agentContent.trim(),
				timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
				mode,
			}
			session.items.push(agentItem)
		}

		session.updatedAt = new Date().toISOString()
		await this.sessions.save(session)

		onEvent({
			type: 'done',
			conversationId: session.conversationId ?? session.codexThreadId ?? '',
			status: turnResult.failed ? 'ERROR' : 'SUCCESS',
			durationMs: turnResult.timeline?.durationMs,
			usage: turnResult.timeline?.usage,
		})
	}

	stopTurn(projectId: string): boolean {
		const activeProviderId = this.activeTurnProvider.get(projectId)
		if (activeProviderId) {
			const provider = this.providers.get(activeProviderId)
			if (provider) {
				const stopped = provider.stopTurn(projectId)
				this.activeTurnProvider.delete(projectId)
				return stopped
			}
		}

		// Otherwise try stopping across all providers
		let stoppedAny = false
		for (const provider of this.providers.values()) {
			if (provider.stopTurn(projectId)) {
				stoppedAny = true
			}
		}
		this.activeTurnProvider.delete(projectId)
		return stoppedAny
	}

	resetProjectSession(projectId: string): void {
		for (const provider of this.providers.values()) {
			provider.resetSession(projectId)
		}
		this.activeTurnProvider.delete(projectId)
	}
}

