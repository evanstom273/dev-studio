import type { ServerUpdateResult } from '@shared/types/system'
import { apiFetch } from './apiClient'

export const systemApi = {
	updateAndRestart(): Promise<ServerUpdateResult> {
		return apiFetch<ServerUpdateResult>('/api/system/update-restart', { method: 'POST' })
	},
}
