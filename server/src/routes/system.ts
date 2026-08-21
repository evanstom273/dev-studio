import { Router } from 'express'
import { freemem, totalmem, uptime, platform } from 'node:os'
import { asyncHandler } from '../middleware.js'
import type { ServerConfig } from '../config.js'
import type { AgyService } from '../services/agyService.js'
import type { SessionStore } from '../store.js'
import { ServerUpdateService } from '../services/serverUpdateService.js'
import { checkAgyAuth } from '../utils/exec.js'
import { queryParam } from '../utils/params.js'
import type { AgyQuotaUsage } from '../types/system.js'

export function createSystemRouter(
	config: ServerConfig,
	agy: AgyService,
	sessions: SessionStore,
): Router {
	const router = Router()
	const updater = new ServerUpdateService(config)

	router.get(
		'/quota',
		asyncHandler(async (req, res) => {
			const projectId = queryParam(req, 'projectId')
			const [authStatus, availableModels, allSessions] = await Promise.all([
				checkAgyAuth(config.agyPath),
				agy.getAvailableModels().catch(() => []),
				sessions.getAll(),
			])

			const totalTokens = {
				inputTokens: 0,
				outputTokens: 0,
				thinkingTokens: 0,
				totalTokens: 0,
				cacheReadTokens: 0,
			}

			let activeSessionTokens: AgyQuotaUsage['activeSessionTokens'] = undefined
			let activeModel: string | undefined

			for (const session of allSessions) {
				let sessionInput = 0
				let sessionOutput = 0
				let sessionThinking = 0
				let sessionTotal = 0

				for (const item of session.items) {
					if (item.kind === 'message') {
						const charCount = item.content.length
						const approxTokens = Math.max(1, Math.round(charCount / 4))
						if (item.role === 'user') {
							sessionInput += approxTokens
							totalTokens.inputTokens += approxTokens
						} else {
							sessionOutput += approxTokens
							totalTokens.outputTokens += approxTokens
						}
						sessionTotal += approxTokens
						totalTokens.totalTokens += approxTokens
					}
				}

				if (projectId && session.projectId === projectId) {
					activeSessionTokens = {
						inputTokens: sessionInput,
						outputTokens: sessionOutput,
						thinkingTokens: sessionThinking,
						totalTokens: sessionTotal,
					}
					activeModel = session.model
				}
			}

			const freeMemBytes = freemem()
			const totalMemBytes = totalmem()
			const usedMemBytes = totalMemBytes - freeMemBytes
			const memoryUsagePercent = Math.round((usedMemBytes / totalMemBytes) * 100)

			const result: AgyQuotaUsage = {
				available: authStatus.available,
				version: authStatus.version,
				authenticated: authStatus.authenticated,
				message: authStatus.message,
				totalTokens,
				activeSessionTokens,
				activeModel,
				availableModels,
				laptopStats: {
					freeMemBytes,
					totalMemBytes,
					usedMemBytes,
					memoryUsagePercent,
					uptimeSeconds: Math.floor(uptime()),
					platform: platform(),
					nodeVersion: process.version,
				},
			}

			res.json(result)
		}),
	)

	router.post(
		'/update-restart',
		asyncHandler(async (_req, res) => {
			if (!config.allowRemoteUpdate) {
				res.status(403).json({ error: 'Remote update is disabled on this laptop' })
				return
			}

			const result = await updater.updateAndRestart()
			res.status(result.ok ? 200 : 500).json(result)
		}),
	)

	return router
}
