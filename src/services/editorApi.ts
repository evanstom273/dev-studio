import { apiFetch } from './apiClient'

export const editorApi = {
	async saveFile(projectId: string, path: string, content: string): Promise<{ ok: boolean; path: string }> {
		return apiFetch<{ ok: boolean; path: string }>(`/api/files/${projectId}/content`, {
			method: 'POST',
			body: JSON.stringify({ path, content }),
		})
	},
}
