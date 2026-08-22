import type { AgentMode, AgentModelDefinition, ProviderStatusInfo, StreamEvent } from '../../types/agent.js'
import type { AgentProvider, SessionTurnContext, TurnExecutionResult } from './agentProvider.js'
import type { AgyService } from '../agyService.js'
import { checkAgyAuth } from '../../utils/exec.js'
import type { ServerConfig } from '../../config.js'

export class AntigravityProvider implements AgentProvider {
	readonly id = 'antigravity' as const
	readonly displayName = 'Antigravity'

	constructor(
		private config: ServerConfig,
		private agyService: AgyService,
	) {}

	async init(): Promise<void> {
		await this.agyService.init()
	}

	async getStatus(_refresh = false): Promise<ProviderStatusInfo> {
		const authStatus = await checkAgyAuth(this.config.agyPath)
		const models = await this.getModels()
		return {
			id: this.id,
			name: this.displayName,
			status: authStatus.available ? (authStatus.authenticated !== false ? 'ready' : 'not_authenticated') : 'not_installed',
			available: authStatus.available,
			authenticated: authStatus.authenticated,
			version: authStatus.version,
			message: authStatus.message,
			models,
		}
	}

	async getModels(): Promise<AgentModelDefinition[]> {
		const rawModels = await this.agyService.getAvailableModels()
		return rawModels.map((id) => ({
			id,
			name: formatModelName(id),
			providerId: 'antigravity',
			providerName: 'Google Antigravity',
			isDefault: id.includes('flash-high') || id.includes('flash-medium'),
		}))
	}

	ownsModel(modelId: string): boolean {
		if (
			modelId.startsWith('gemini-') ||
			modelId.startsWith('claude-') ||
			modelId.startsWith('agy:') ||
			modelId.startsWith('antigravity:')
		) {
			return true
		}
		if (
			modelId.startsWith('codex:') ||
			modelId.startsWith('openai:') ||
			modelId.startsWith('gpt-') ||
			modelId.startsWith('o1') ||
			modelId.startsWith('o3') ||
			modelId.startsWith('o4')
		) {
			return false
		}
		return true
	}

	async runTurn(
		projectPath: string,
		projectId: string,
		prompt: string,
		mode: AgentMode,
		model: string | undefined,
		context: SessionTurnContext,
		onEvent: (event: StreamEvent) => void,
	): Promise<TurnExecutionResult> {
		const conversationId = context.isProviderSwitch ? null : (context.conversationId ?? null)
		return this.agyService.runSingleTurn(projectPath, projectId, prompt, mode, conversationId, model, onEvent)
	}

	stopTurn(projectId: string): boolean {
		return this.agyService.stopTurn(projectId)
	}

	resetSession(projectId: string): void {
		this.agyService.resetProjectSession(projectId)
	}
}

function formatModelName(id: string): string {
	if (id.startsWith('gemini-')) {
		return id.replace('gemini-', 'Gemini ').replace(/-/g, ' ')
	}
	if (id.startsWith('claude-')) {
		return id.replace('claude-', 'Claude ').replace(/-/g, ' ')
	}
	if (id.startsWith('gpt-')) {
		return id.replace('gpt-', 'GPT ').replace(/-/g, ' ')
	}
	return id
}

