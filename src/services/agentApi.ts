import type {
	AgentSession,
	AvailableModelsResponse,
	ProviderStatusInfo,
	RunCommandRequest,
	RunCommandResult,
	SendMessageRequest,
	StopGenerationResponse,
	UploadAttachmentResponse,
} from '@shared/types/agent'
import type { ChangedFile, FileDiff, FileTreeNode } from '@shared/types/git'
import type { Project } from '@shared/types/project'
import { apiFetch, streamAgentMessage } from './apiClient'

export type AgentApi = {
	listProjects(): Promise<Project[]>
	getSession(projectId: string): Promise<AgentSession>
	getAvailableModels(): Promise<string[]>
	getAvailableModelsInfo(): Promise<AvailableModelsResponse>
	getProviders(): Promise<ProviderStatusInfo[]>
	sendMessage(
		request: SendMessageRequest,
		onEvent: (event: unknown) => void,
		signal?: AbortSignal,
	): Promise<void>
	stopGeneration(projectId: string): Promise<boolean>
	uploadAttachment(projectId: string, file: File): Promise<UploadAttachmentResponse>
	listChanges(projectId: string): Promise<ChangedFile[]>
	getDiff(projectId: string, path: string, staged?: boolean): Promise<FileDiff | null>
	getFileTree(projectId: string): Promise<FileTreeNode[]>
	getFileContent(projectId: string, path: string): Promise<string | null>
	runCommand(request: RunCommandRequest): Promise<RunCommandResult>
	resetSession(projectId: string): Promise<AgentSession>
}

export const agentApi: AgentApi = {
	async listProjects() {
		return apiFetch<Project[]>('/api/projects')
	},

	async getSession(projectId) {
		return apiFetch<AgentSession>(`/api/agent/session/${projectId}`)
	},

	async getAvailableModels() {
		const res = await apiFetch<AvailableModelsResponse>('/api/agent/models')
		return res.models ?? []
	},

	async getAvailableModelsInfo() {
		return apiFetch<AvailableModelsResponse>('/api/agent/models')
	},

	async getProviders() {
		return apiFetch<ProviderStatusInfo[]>('/api/agent/providers')
	},

	async sendMessage(request, onEvent, signal) {
		await streamAgentMessage(
			request.projectId,
			request.content,
			request.mode ?? 'agent',
			onEvent,
			{
				model: request.model,
				attachments: request.attachments,
				signal,
			},
		)
	},

	async stopGeneration(projectId) {
		const res = await apiFetch<StopGenerationResponse>('/api/agent/stop', {
			method: 'POST',
			body: JSON.stringify({ projectId }),
		})
		return res.stopped
	},

	async uploadAttachment(projectId, file) {
		const arrayBuffer = await file.arrayBuffer()
		const bytes = new Uint8Array(arrayBuffer)
		let binary = ''
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i])
		}
		const base64 = btoa(binary)

		return apiFetch<UploadAttachmentResponse>('/api/agent/upload', {
			method: 'POST',
			body: JSON.stringify({
				projectId,
				filename: file.name,
				contentType: file.type || 'application/octet-stream',
				base64,
			}),
		})
	},

	async listChanges(projectId) {
		const status = await apiFetch<{ changed: ChangedFile[] }>(`/api/git/${projectId}/status`)
		return status.changed
	},

	async getDiff(projectId, path, staged = false) {
		const query = new URLSearchParams({ path, staged: String(staged) })
		return apiFetch<FileDiff | null>(`/api/git/${projectId}/diff?${query}`)
	},

	async getFileTree(projectId) {
		return apiFetch<FileTreeNode[]>(`/api/files/${projectId}/tree`)
	},

	async getFileContent(projectId, path) {
		const query = new URLSearchParams({ path })
		const result = await apiFetch<{ content: string }>(`/api/files/${projectId}/content?${query}`)
		return result.content
	},

	async runCommand(request) {
		return apiFetch<RunCommandResult>('/api/run', {
			method: 'POST',
			body: JSON.stringify(request),
		})
	},

	async resetSession(projectId) {
		return apiFetch<AgentSession>(`/api/agent/session/${projectId}/reset`, { method: 'POST' })
	},
}
