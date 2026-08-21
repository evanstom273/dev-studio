import type { AgentSession, RunCommandRequest, RunCommandResult, SendMessageRequest } from '@shared/types/agent'
import type { ChangedFile, FileDiff, FileTreeNode } from '@shared/types/git'
import type { Project } from '@shared/types/project'
import { apiFetch, streamAgentMessage } from './apiClient'

export type AgentApi = {
	listProjects(): Promise<Project[]>
	getSession(projectId: string): Promise<AgentSession>
	sendMessage(request: SendMessageRequest, onEvent: (event: unknown) => void): Promise<void>
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

	async sendMessage(request, onEvent) {
		await streamAgentMessage(
			request.projectId,
			request.content,
			request.mode ?? 'agent',
			onEvent,
		)
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
