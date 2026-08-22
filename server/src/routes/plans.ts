import { Router } from 'express'
import { asyncHandler } from '../middleware.js'
import type { PlanService } from '../services/planService.js'
import type { ArtifactService } from '../services/artifactService.js'
import { param } from '../utils/params.js'
import type { CreatePlanRequest, PlanStep, UpdatePlanRequest } from '../types/plan.js'

export function createPlansRouter(
	plans: PlanService,
	artifacts: ArtifactService,
): Router {
	const router = Router()

	router.get(
		'/:projectId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const list = await plans.list(projectId)
			res.json(list)
		}),
	)

	router.post(
		'/:projectId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const body = req.body as CreatePlanRequest
			const plan = await plans.create(projectId, body)
			res.status(201).json(plan)
		}),
	)

	router.get(
		'/:projectId/:planId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const planId = param(req, 'planId')
			const plan = await plans.get(projectId, planId)
			if (!plan) {
				res.status(404).json({ error: 'Plan not found' })
				return
			}
			res.json(plan)
		}),
	)

	router.put(
		'/:projectId/:planId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const planId = param(req, 'planId')
			const body = req.body as UpdatePlanRequest
			const updated = await plans.update(projectId, planId, body)
			if (!updated) {
				res.status(404).json({ error: 'Plan not found' })
				return
			}
			res.json(updated)
		}),
	)

	router.delete(
		'/:projectId/:planId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const planId = param(req, 'planId')
			const deleted = await plans.delete(projectId, planId)
			res.json({ success: deleted })
		}),
	)

	router.post(
		'/:projectId/:planId/steps',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const planId = param(req, 'planId')
			const body = req.body as Omit<PlanStep, 'id' | 'createdAt'>
			const updated = await plans.addStep(projectId, planId, body)
			if (!updated) {
				res.status(404).json({ error: 'Plan not found' })
				return
			}
			res.json(updated)
		}),
	)

	router.put(
		'/:projectId/:planId/steps/:stepId',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const planId = param(req, 'planId')
			const stepId = param(req, 'stepId')
			const body = req.body as Partial<PlanStep>
			const updated = await plans.updateStep(projectId, planId, stepId, body)
			if (!updated) {
				res.status(404).json({ error: 'Plan or step not found' })
				return
			}
			res.json(updated)
		}),
	)

	router.post(
		'/:projectId/:planId/reorder',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const planId = param(req, 'planId')
			const { stepIds } = req.body as { stepIds: string[] }
			const updated = await plans.reorderSteps(projectId, planId, stepIds || [])
			if (!updated) {
				res.status(404).json({ error: 'Plan not found' })
				return
			}
			res.json(updated)
		}),
	)

	router.post(
		'/:projectId/:planId/to-artifact',
		asyncHandler(async (req, res) => {
			const projectId = param(req, 'projectId')
			const planId = param(req, 'planId')
			try {
				const artifact = await plans.createArtifactFromPlan(projectId, planId, artifacts)
				res.status(201).json(artifact)
			} catch (err) {
				res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create artifact' })
			}
		}),
	)

	return router
}

