import type {
	Problem,
	ProblemFilter,
	ProblemSummary,
} from '@shared/types/problem'
import { apiFetch } from './apiClient'

export const problemApi = {
	async list(projectId: string, filter?: ProblemFilter): Promise<Problem[]> {
		const params = new URLSearchParams()
		if (filter?.status && filter.status !== 'all') params.set('status', filter.status)
		if (filter?.severity && filter.severity !== 'all') params.set('severity', filter.severity)
		if (filter?.source && filter.source !== 'all') params.set('source', filter.source)
		if (filter?.search) params.set('search', filter.search)

		const query = params.toString() ? `?${params.toString()}` : ''
		return apiFetch<Problem[]>(`/api/problems/${encodeURIComponent(projectId)}${query}`)
	},

	async getSummary(projectId: string): Promise<ProblemSummary> {
		return apiFetch<ProblemSummary>(`/api/problems/${encodeURIComponent(projectId)}/summary`)
	},

	async get(projectId: string, problemId: string): Promise<Problem> {
		return apiFetch<Problem>(
			`/api/problems/${encodeURIComponent(projectId)}/${encodeURIComponent(problemId)}`,
		)
	},

	async refresh(projectId: string): Promise<Problem[]> {
		return apiFetch<Problem[]>(`/api/problems/${encodeURIComponent(projectId)}/refresh`, {
			method: 'POST',
		})
	},

	async addProblem(
		projectId: string,
		problem: Omit<Problem, 'id' | 'createdAt' | 'updatedAt' | 'resolved' | 'projectId'> & { id?: string },
	): Promise<Problem> {
		return apiFetch<Problem>(`/api/problems/${encodeURIComponent(projectId)}`, {
			method: 'POST',
			body: JSON.stringify(problem),
		})
	},

	async resolve(projectId: string, problemId: string): Promise<Problem> {
		return apiFetch<Problem>(
			`/api/problems/${encodeURIComponent(projectId)}/${encodeURIComponent(problemId)}/resolve`,
			{
				method: 'POST',
			},
		)
	},

	async reopen(projectId: string, problemId: string): Promise<Problem> {
		return apiFetch<Problem>(
			`/api/problems/${encodeURIComponent(projectId)}/${encodeURIComponent(problemId)}/reopen`,
			{
				method: 'POST',
			},
		)
	},

	async delete(projectId: string, problemId: string): Promise<boolean> {
		const res = await apiFetch<{ success: boolean }>(
			`/api/problems/${encodeURIComponent(projectId)}/${encodeURIComponent(problemId)}`,
			{
				method: 'DELETE',
			},
		)
		return res.success
	},

	async clearResolved(projectId: string): Promise<void> {
		await apiFetch<{ success: boolean }>(
			`/api/problems/${encodeURIComponent(projectId)}/resolved`,
			{
				method: 'DELETE',
			},
		)
	},
}

