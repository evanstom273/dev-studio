import type { AgentSession, SendMessageRequest, SendMessageResponse } from '../types/agent'
import type { ChangedFile, FileDiff, FileTreeNode } from '../types/files'
import type { Project } from '../types/project'

export type AgentApi = {
	listProjects(): Promise<Project[]>
	getSession(projectId: string): Promise<AgentSession>
	sendMessage(request: SendMessageRequest): Promise<SendMessageResponse>
	listChanges(projectId: string): Promise<ChangedFile[]>
	getDiff(projectId: string, path: string): Promise<FileDiff | null>
	getFileTree(projectId: string): Promise<FileTreeNode[]>
	getFileContent(projectId: string, path: string): Promise<string | null>
}

/**
 * Placeholder service boundary for future backend integration.
 * Replace mock implementations with real API calls when ready.
 */
export const agentApi: AgentApi = {
	async listProjects() {
		throw new Error('Agent API not connected')
	},
	async getSession(_projectId: string) {
		throw new Error('Agent API not connected')
	},
	async sendMessage(_request: SendMessageRequest) {
		throw new Error('Agent API not connected')
	},
	async listChanges(_projectId: string) {
		throw new Error('Agent API not connected')
	},
	async getDiff(_projectId: string, _path: string) {
		throw new Error('Agent API not connected')
	},
	async getFileTree(_projectId: string) {
		throw new Error('Agent API not connected')
	},
	async getFileContent(_projectId: string, _path: string) {
		throw new Error('Agent API not connected')
	},
}
