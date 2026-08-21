import { Router } from 'express'
import type { ServerConfig } from '../config.js'
import { asyncHandler } from '../middleware.js'
import { checkGitHubApi } from '../services/githubRestClient.js'
import { checkAgyAuth, checkCommand } from '../utils/exec.js'

const startTime = Date.now()

export function createHealthRouter(config: ServerConfig): Router {
	const router = Router()

	router.get(
		'/health',
		asyncHandler(async (_req, res) => {
			const [agy, git, github] = await Promise.all([
				checkAgyAuth(config.agyPath),
				checkCommand('git'),
				checkGitHubApi(config.githubToken),
			])

			const allOk = agy.available && git.available
			const status = allOk ? (agy.authenticated ? 'ok' : 'degraded') : 'degraded'

			res.json({
				status,
				version: '0.2.0',
				agy,
				git,
				github,
				uptime: Math.floor((Date.now() - startTime) / 1000),
			})
		}),
	)

	router.get('/config/public', (_req, res) => {
		res.json({
			version: '0.2.0',
			requiresToken: Boolean(config.token),
			projectsRoot: config.projectsRoot,
		})
	})

	return router
}
