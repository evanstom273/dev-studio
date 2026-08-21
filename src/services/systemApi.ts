import type { AgyQuotaUsage, ServerUpdateResult } from '@shared/types/system'
import { apiFetch } from './apiClient'

export const systemApi = {
	getAgyQuota(projectId?: string): Promise<AgyQuotaUsage> {
		const query = projectId ? `?projectId=${projectId}` : ''
		return apiFetch<AgyQuotaUsage>(`/api/system/quota${query}`)
	},

	updateAndRestart(): Promise<ServerUpdateResult> {
		return apiFetch<ServerUpdateResult>('/api/system/update-restart', { method: 'POST' })
	},
}
