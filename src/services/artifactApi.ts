import type {
	Artifact,
	CreateArtifactRequest,
	ImportArtifactFromRepoRequest,
	SaveArtifactToRepoRequest,
	UpdateArtifactRequest,
} from '@shared/types/artifact'
import { apiFetch } from './apiClient'

export const artifactApi = {
	async listArtifacts(projectId: string): Promise<Artifact[]> {
		return apiFetch<Artifact[]>(`/api/artifacts/${projectId}`)
	},

	async getArtifact(projectId: string, id: string): Promise<Artifact> {
		return apiFetch<Artifact>(`/api/artifacts/${projectId}/${id}`)
	},

	async createArtifact(projectId: string, req: CreateArtifactRequest): Promise<Artifact> {
		return apiFetch<Artifact>(`/api/artifacts/${projectId}`, {
			method: 'POST',
			body: JSON.stringify(req),
		})
	},

	async updateArtifact(
		projectId: string,
		id: string,
		req: UpdateArtifactRequest,
	): Promise<Artifact> {
		return apiFetch<Artifact>(`/api/artifacts/${projectId}/${id}`, {
			method: 'PUT',
			body: JSON.stringify(req),
		})
	},

	async deleteArtifact(projectId: string, id: string): Promise<boolean> {
		const res = await apiFetch<{ ok: boolean }>(`/api/artifacts/${projectId}/${id}`, {
			method: 'DELETE',
		})
		return res.ok
	},

	async saveToRepo(
		projectId: string,
		id: string,
		targetPath: string,
	): Promise<{ ok: boolean; path: string }> {
		return apiFetch<{ ok: boolean; path: string }>(
			`/api/artifacts/${projectId}/${id}/save-to-repo`,
			{
				method: 'POST',
				body: JSON.stringify({ targetPath } satisfies SaveArtifactToRepoRequest),
			},
		)
	},

	async importFromRepo(
		projectId: string,
		sourcePath: string,
		title?: string,
	): Promise<Artifact> {
		return apiFetch<Artifact>(`/api/artifacts/${projectId}/import-from-repo`, {
			method: 'POST',
			body: JSON.stringify({ sourcePath, title } satisfies ImportArtifactFromRepoRequest),
		})
	},
}
