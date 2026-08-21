import type { AgyQuotaUsage, ServerUpdateResult } from '@shared/types/system'
import { apiFetch } from './apiClient'

export const systemApi = {
	getAgyQuota(projectId?: string, refresh = false): Promise<AgyQuotaUsage> {
		const params = new URLSearchParams()
		if (projectId) params.set('projectId', projectId)
		if (refresh) params.set('refresh', '1')
		const query = params.toString()
		return apiFetch<AgyQuotaUsage>(`/api/system/quota${query ? `?${query}` : ''}`)
	},

	updateAndRestart(): Promise<ServerUpdateResult> {
		return apiFetch<ServerUpdateResult>('/api/system/update-restart', { method: 'POST' })
	},
}
