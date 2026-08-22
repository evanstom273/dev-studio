import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ServerConfig } from '../config.js'
import type {
	CreatePlanRequest,
	Plan,
	PlanStep,
	UpdatePlanRequest,
} from '../types/plan.js'
import type { ArtifactService } from './artifactService.js'
import type { Artifact } from '../types/artifact.js'

export class PlanService {
	private readonly plansBaseDir: string

	constructor(config: ServerConfig) {
		this.plansBaseDir = join(config.dataDir, 'plans')
	}

	async init(): Promise<void> {
		await mkdir(this.plansBaseDir, { recursive: true })
	}

	private projectDir(projectId: string): string {
		const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_')
		return join(this.plansBaseDir, safeId)
	}

	private planPath(projectId: string, planId: string): string {
		const safePlanId = planId.replace(/[^a-zA-Z0-9_-]/g, '_')
		return join(this.projectDir(projectId), `${safePlanId}.json`)
	}

	async list(projectId: string): Promise<Plan[]> {
		const dir = this.projectDir(projectId)
		try {
			await mkdir(dir, { recursive: true })
			const files = await readdir(dir)
			const plans: Plan[] = []
			for (const file of files) {
				if (!file.endsWith('.json')) continue
				try {
					const raw = await readFile(join(dir, file), 'utf8')
					const parsed = JSON.parse(raw) as Plan
					plans.push(parsed)
				} catch {
					// skip invalid file
				}
			}
			return plans.sort(
				(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
			)
		} catch {
			return []
		}
	}

	async get(projectId: string, planId: string): Promise<Plan | null> {
		try {
			const raw = await readFile(this.planPath(projectId, planId), 'utf8')
			return JSON.parse(raw) as Plan
		} catch {
			return null
		}
	}

	async create(projectId: string, req: CreatePlanRequest): Promise<Plan> {
		await mkdir(this.projectDir(projectId), { recursive: true })
		const id = `plan_${Date.now()}_${randomUUID().slice(0, 6)}`
		const now = new Date().toISOString()

		const steps: PlanStep[] = (req.steps || []).map((s, idx) => ({
			id: s.id || `step_${Date.now()}_${idx}_${randomUUID().slice(0, 4)}`,
			title: s.title,
			detail: s.detail,
			status: s.status || 'pending',
			file: s.file,
			line: s.line,
			command: s.command,
			artifactId: s.artifactId,
			problemId: s.problemId,
			createdAt: now,
			completedAt: s.status === 'completed' ? now : undefined,
		}))

		const plan: Plan = {
			id,
			projectId,
			conversationId: req.conversationId,
			title: req.title.trim() || 'Untitled Plan',
			description: req.description?.trim(),
			status: 'pending',
			steps,
			createdAt: now,
			updatedAt: now,
		}

		await writeFile(this.planPath(projectId, id), JSON.stringify(plan, null, 2), 'utf8')
		return plan
	}

	async update(projectId: string, planId: string, req: UpdatePlanRequest): Promise<Plan | null> {
		const existing = await this.get(projectId, planId)
		if (!existing) return null

		const now = new Date().toISOString()
		const updated: Plan = {
			...existing,
			title: req.title !== undefined ? req.title.trim() || existing.title : existing.title,
			description: req.description !== undefined ? req.description.trim() : existing.description,
			status: req.status !== undefined ? req.status : existing.status,
			steps: req.steps !== undefined ? req.steps : existing.steps,
			updatedAt: now,
		}

		// Check if all steps completed
		if (updated.steps.length > 0 && updated.steps.every((s) => s.status === 'completed' || s.status === 'skipped')) {
			updated.status = 'completed'
		} else if (updated.steps.some((s) => s.status === 'in_progress')) {
			updated.status = 'in_progress'
		} else if (updated.steps.some((s) => s.status === 'failed')) {
			updated.status = 'failed'
		}

		await writeFile(this.planPath(projectId, planId), JSON.stringify(updated, null, 2), 'utf8')
		return updated
	}

	async delete(projectId: string, planId: string): Promise<boolean> {
		try {
			await rm(this.planPath(projectId, planId))
			return true
		} catch {
			return false
		}
	}

	async addStep(
		projectId: string,
		planId: string,
		step: Omit<PlanStep, 'id' | 'createdAt'>,
	): Promise<Plan | null> {
		const plan = await this.get(projectId, planId)
		if (!plan) return null

		const now = new Date().toISOString()
		const newStep: PlanStep = {
			...step,
			id: `step_${Date.now()}_${randomUUID().slice(0, 4)}`,
			createdAt: now,
			completedAt: step.status === 'completed' ? now : undefined,
		}

		plan.steps.push(newStep)
		plan.updatedAt = now
		if (plan.status === 'completed') plan.status = 'in_progress'

		await writeFile(this.planPath(projectId, planId), JSON.stringify(plan, null, 2), 'utf8')
		return plan
	}

	async updateStep(
		projectId: string,
		planId: string,
		stepId: string,
		updates: Partial<PlanStep>,
	): Promise<Plan | null> {
		const plan = await this.get(projectId, planId)
		if (!plan) return null

		const stepIdx = plan.steps.findIndex((s) => s.id === stepId)
		if (stepIdx === -1) return null

		const existingStep = plan.steps[stepIdx]
		const now = new Date().toISOString()

		const updatedStep: PlanStep = {
			...existingStep,
			...updates,
			completedAt:
				updates.status === 'completed' && existingStep.status !== 'completed'
					? now
					: updates.status && updates.status !== 'completed'
					? undefined
					: existingStep.completedAt,
		}

		plan.steps[stepIdx] = updatedStep
		plan.updatedAt = now

		// Update overall plan status
		if (plan.steps.length > 0 && plan.steps.every((s) => s.status === 'completed' || s.status === 'skipped')) {
			plan.status = 'completed'
		} else if (plan.steps.some((s) => s.status === 'failed')) {
			plan.status = 'failed'
		} else if (plan.steps.some((s) => s.status === 'in_progress')) {
			plan.status = 'in_progress'
		}

		await writeFile(this.planPath(projectId, planId), JSON.stringify(plan, null, 2), 'utf8')
		return plan
	}

	async reorderSteps(projectId: string, planId: string, stepIds: string[]): Promise<Plan | null> {
		const plan = await this.get(projectId, planId)
		if (!plan) return null

		const stepMap = new Map<string, PlanStep>()
		for (const step of plan.steps) {
			stepMap.set(step.id, step)
		}

		const reordered: PlanStep[] = []
		for (const id of stepIds) {
			const s = stepMap.get(id)
			if (s) {
				reordered.push(s)
				stepMap.delete(id)
			}
		}

		// Append any remaining
		for (const s of stepMap.values()) {
			reordered.push(s)
		}

		plan.steps = reordered
		plan.updatedAt = new Date().toISOString()

		await writeFile(this.planPath(projectId, planId), JSON.stringify(plan, null, 2), 'utf8')
		return plan
	}

	async createArtifactFromPlan(
		projectId: string,
		planId: string,
		artifactService: ArtifactService,
	): Promise<Artifact> {
		const plan = await this.get(projectId, planId)
		if (!plan) {
			throw new Error('Plan not found')
		}

		const lines: string[] = [
			`# Execution Plan: ${plan.title}`,
			'',
			plan.description ? `> ${plan.description}\n` : '',
			`**Status**: \`${plan.status.toUpperCase()}\` | **Created**: ${new Date(plan.createdAt).toLocaleString()}`,
			'',
			'## Implementation Steps',
			'',
		]

		for (let i = 0; i < plan.steps.length; i++) {
			const step = plan.steps[i]
			let checkbox = '[ ]'
			if (step.status === 'completed') checkbox = '[x]'
			else if (step.status === 'failed') checkbox = '[!]'
			else if (step.status === 'skipped') checkbox = '[-]'
			else if (step.status === 'in_progress') checkbox = '[/]'

			lines.push(`- ${checkbox} **Step ${i + 1}: ${step.title}** (\`${step.status}\`)`)
			if (step.detail) {
				lines.push(`  - Details: ${step.detail}`)
			}
			if (step.file) {
				lines.push(`  - File: \`${step.file}\`${step.line ? ` (line ${step.line})` : ''}`)
			}
			if (step.command) {
				lines.push(`  - Command: \`${step.command}\``)
			}
			if (step.problemId) {
				lines.push(`  - Linked Problem: \`${step.problemId}\``)
			}
		}

		lines.push('', '---', `*Generated from Dev Studio Tasks & Plans on ${new Date().toLocaleString()}*`)

		const content = lines.join('\n')
		return artifactService.create(projectId, {
			title: `Plan: ${plan.title}`,
			type: 'markdown',
			content,
			tags: ['plan', 'tasks'],
		})
	}
}

