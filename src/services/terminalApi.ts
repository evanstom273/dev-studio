import type { CreateTerminalSessionRequest, TerminalSessionInfo } from '@shared/types/terminal'
import { apiFetch, getApiBase, loadConnectionConfig } from './apiClient'

export const terminalApi = {
	async listSessions(projectId: string): Promise<TerminalSessionInfo[]> {
		return apiFetch<TerminalSessionInfo[]>(`/api/terminal/${projectId}/sessions`)
	},

	async createSession(
		projectId: string,
		req?: CreateTerminalSessionRequest,
	): Promise<TerminalSessionInfo> {
		return apiFetch<TerminalSessionInfo>(`/api/terminal/${projectId}/sessions`, {
			method: 'POST',
			body: JSON.stringify(req ?? {}),
		})
	},

	async getDefaultSession(projectId: string): Promise<TerminalSessionInfo> {
		return apiFetch<TerminalSessionInfo>(`/api/terminal/${projectId}/sessions/default`, {
			method: 'POST',
			body: JSON.stringify({}),
		})
	},

	async killSession(projectId: string, sessionId: string): Promise<boolean> {
		const res = await apiFetch<{ ok: boolean }>(
			`/api/terminal/${projectId}/sessions/${sessionId}`,
			{
				method: 'DELETE',
			},
		)
		return res.ok
	},

	async renameSession(
		projectId: string,
		sessionId: string,
		title: string,
	): Promise<TerminalSessionInfo> {
		return apiFetch<TerminalSessionInfo>(
			`/api/terminal/${projectId}/sessions/${sessionId}`,
			{
				method: 'PATCH',
				body: JSON.stringify({ title }),
			},
		)
	},

	getWebSocketUrl(sessionId: string): string {
		const base = getApiBase()
		const config = loadConnectionConfig()
		const wsBase = base.startsWith('https://')
			? base.replace(/^https:\/\//, 'wss://')
			: base.replace(/^http:\/\//, 'ws://')
		const tokenParam = config.token ? `&token=${encodeURIComponent(config.token)}` : ''
		return `${wsBase}/api/terminal/ws?sessionId=${encodeURIComponent(sessionId)}${tokenParam}`
	},
}
