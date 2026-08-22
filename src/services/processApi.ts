import type {
	ProcessActionResponse,
	ProcessListResponse,
	StartProcessRequest,
} from '@shared/types/process'
import { apiFetch } from './apiClient'

export const processApi = {
	async list(projectId: string, showAll = false): Promise<ProcessListResponse> {
		const query = showAll ? '?all=true' : ''
		return apiFetch<ProcessListResponse>(`/api/processes/${encodeURIComponent(projectId)}${query}`)
	},

	async start(projectId: string, req: StartProcessRequest): Promise<ProcessActionResponse> {
		return apiFetch<ProcessActionResponse>(`/api/processes/${encodeURIComponent(projectId)}/start`, {
			method: 'POST',
			body: JSON.stringify(req),
		})
	},

	async stop(
		projectId: string,
		pid: number,
		options?: { force?: boolean; acknowledgeBackend?: boolean },
	): Promise<ProcessActionResponse> {
		return apiFetch<ProcessActionResponse>(
			`/api/processes/${encodeURIComponent(projectId)}/${pid}/stop`,
			{
				method: 'POST',
				body: JSON.stringify(options || {}),
			},
		)
	},

	async restart(projectId: string, pid: number): Promise<ProcessActionResponse> {
		return apiFetch<ProcessActionResponse>(
			`/api/processes/${encodeURIComponent(projectId)}/${pid}/restart`,
			{
				method: 'POST',
			},
		)
	},

	async kill(
		projectId: string,
		pid: number,
		options?: { acknowledgeBackend?: boolean },
	): Promise<ProcessActionResponse> {
		return apiFetch<ProcessActionResponse>(
			`/api/processes/${encodeURIComponent(projectId)}/${pid}/kill`,
			{
				method: 'POST',
				body: JSON.stringify(options || {}),
			},
		)
	},
}

