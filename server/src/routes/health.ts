import { Router } from 'express'
import type { ServerConfig } from '../config.js'
import { asyncHandler } from '../middleware.js'
import { checkGitHubApi } from '../services/githubRestClient.js'
import type { AgentRouterService } from '../services/agent/agentRouterService.js'
import { checkAgyAuth, checkCommand } from '../utils/exec.js'
import { resolveGitHubToken } from '../utils/githubToken.js'

const startTime = Date.now()

export function createHealthRouter(config: ServerConfig, agentService?: AgentRouterService): Router {
	const router = Router()

	router.get(
		'/health',
		asyncHandler(async (req, res) => {
			const githubToken = resolveGitHubToken(req, config)
			const [agy, git, github, providers] = await Promise.all([
				checkAgyAuth(config.agyPath),
				checkCommand('git'),
				checkGitHubApi(githubToken),
				agentService ? agentService.getProviderStatuses() : Promise.resolve([]),
			])

			const codex = providers.find((p) => p.id === 'codex')
			const allOk = agy.available && git.available
			const status = allOk ? (agy.authenticated ? 'ok' : 'degraded') : 'degraded'

			res.json({
				status,
				version: '0.2.0',
				agy,
				git,
				github,
				codex: codex
					? {
							available: codex.available,
							authenticated: codex.authenticated,
							status: codex.status,
							message: codex.message,
							version: codex.version,
						}
					: null,
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
