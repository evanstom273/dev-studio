import type {
	CreatePlanRequest,
	Plan,
	PlanStep,
	UpdatePlanRequest,
} from '@shared/types/plan'
import type { Artifact } from '@shared/types/artifact'
import { apiFetch } from './apiClient'

export const planApi = {
	async list(projectId: string): Promise<Plan[]> {
		return apiFetch<Plan[]>(`/api/plans/${encodeURIComponent(projectId)}`)
	},

	async get(projectId: string, planId: string): Promise<Plan> {
		return apiFetch<Plan>(
			`/api/plans/${encodeURIComponent(projectId)}/${encodeURIComponent(planId)}`,
		)
	},

	async create(projectId: string, req: CreatePlanRequest): Promise<Plan> {
		return apiFetch<Plan>(`/api/plans/${encodeURIComponent(projectId)}`, {
			method: 'POST',
			body: JSON.stringify(req),
		})
	},

	async update(projectId: string, planId: string, req: UpdatePlanRequest): Promise<Plan> {
		return apiFetch<Plan>(
			`/api/plans/${encodeURIComponent(projectId)}/${encodeURIComponent(planId)}`,
			{
				method: 'PUT',
				body: JSON.stringify(req),
			},
		)
	},

	async delete(projectId: string, planId: string): Promise<boolean> {
		const res = await apiFetch<{ success: boolean }>(
			`/api/plans/${encodeURIComponent(projectId)}/${encodeURIComponent(planId)}`,
			{
				method: 'DELETE',
			},
		)
		return res.success
	},

	async addStep(
		projectId: string,
		planId: string,
		step: Omit<PlanStep, 'id' | 'createdAt'>,
	): Promise<Plan> {
		return apiFetch<Plan>(
			`/api/plans/${encodeURIComponent(projectId)}/${encodeURIComponent(planId)}/steps`,
			{
				method: 'POST',
				body: JSON.stringify(step),
			},
		)
	},

	async updateStep(
		projectId: string,
		planId: string,
		stepId: string,
		updates: Partial<PlanStep>,
	): Promise<Plan> {
		return apiFetch<Plan>(
			`/api/plans/${encodeURIComponent(projectId)}/${encodeURIComponent(planId)}/steps/${encodeURIComponent(stepId)}`,
			{
				method: 'PUT',
				body: JSON.stringify(updates),
			},
		)
	},

	async reorderSteps(projectId: string, planId: string, stepIds: string[]): Promise<Plan> {
		return apiFetch<Plan>(
			`/api/plans/${encodeURIComponent(projectId)}/${encodeURIComponent(planId)}/reorder`,
			{
				method: 'POST',
				body: JSON.stringify({ stepIds }),
			},
		)
	},

	async createArtifactFromPlan(projectId: string, planId: string): Promise<Artifact> {
		return apiFetch<Artifact>(
			`/api/plans/${encodeURIComponent(projectId)}/${encodeURIComponent(planId)}/to-artifact`,
			{
				method: 'POST',
			},
		)
	},
}

