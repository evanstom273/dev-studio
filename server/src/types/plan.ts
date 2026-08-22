export type StepStatus =
	| 'pending'
	| 'in_progress'
	| 'completed'
	| 'failed'
	| 'skipped'

export type PlanStatus =
	| 'pending'
	| 'in_progress'
	| 'completed'
	| 'failed'
	| 'cancelled'

export type PlanStep = {
	id: string
	title: string
	detail?: string
	status: StepStatus
	file?: string
	line?: number
	command?: string
	artifactId?: string
	problemId?: string
	createdAt: string
	completedAt?: string
}

export type Plan = {
	id: string
	projectId: string
	conversationId?: string
	title: string
	description?: string
	status: PlanStatus
	steps: PlanStep[]
	createdAt: string
	updatedAt: string
}

export type CreatePlanRequest = {
	title: string
	description?: string
	conversationId?: string
	steps?: Array<Omit<PlanStep, 'id' | 'createdAt'> & { id?: string }>
}

export type UpdatePlanRequest = {
	title?: string
	description?: string
	status?: PlanStatus
	steps?: PlanStep[]
}

