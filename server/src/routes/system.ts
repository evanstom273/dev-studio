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

			const WEEKLY_TOKEN_LIMIT = 10_000_000
			const SESSION_TOKEN_LIMIT = 1_000_000

			const totalTokens: AgyQuotaUsage['totalTokens'] = {
				inputTokens: 0,
				outputTokens: 0,
				thinkingTokens: 0,
				totalTokens: 0,
				cacheReadTokens: 0,
			}

			const weeklyTokens = {
				inputTokens: 0,
				outputTokens: 0,
				thinkingTokens: 0,
				totalTokens: 0,
				promptsCount: 0,
			}

			let activeSessionTokens: AgyQuotaUsage['activeSessionTokens'] = undefined
			let sessionQuota: AgyQuotaUsage['sessionQuota'] = undefined
			let activeModel: string | undefined

			const now = new Date()
			const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000

			// Compute next Sunday 23:59:59 UTC weekly reset
			const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7
			const nextReset = new Date(
				Date.UTC(
					now.getUTCFullYear(),
					now.getUTCMonth(),
					now.getUTCDate() + daysUntilSunday,
					23,
					59,
					59,
					999,
				),
			)
			const weeklyResetSeconds = Math.max(0, Math.floor((nextReset.getTime() - now.getTime()) / 1000))

			for (const session of allSessions) {
				let sessionInput = 0
				let sessionOutput = 0
				let sessionThinking = 0
				let sessionTotal = 0
				let sessionTurns = 0
				let sessionMessages = 0

				const sessionUpdatedMs = session.updatedAt ? new Date(session.updatedAt).getTime() : Date.now()
				const isWithinWeek = sessionUpdatedMs >= sevenDaysAgoMs

				for (const item of session.items) {
					if (item.kind === 'message') {
						sessionMessages++
						const charCount = item.content.length
						const approxTokens = Math.max(1, Math.round(charCount / 4))
						if (item.role === 'user') {
							sessionTurns++
							sessionInput += approxTokens
							totalTokens.inputTokens += approxTokens
							if (isWithinWeek) {
								weeklyTokens.inputTokens += approxTokens
								weeklyTokens.promptsCount++
							}
						} else {
							sessionOutput += approxTokens
							totalTokens.outputTokens += approxTokens
							if (isWithinWeek) {
								weeklyTokens.outputTokens += approxTokens
							}
						}
						sessionTotal += approxTokens
						totalTokens.totalTokens += approxTokens
						if (isWithinWeek) {
							weeklyTokens.totalTokens += approxTokens
						}
					}
				}

				if (projectId && session.projectId === projectId) {
					activeSessionTokens = {
						inputTokens: sessionInput,
						outputTokens: sessionOutput,
						thinkingTokens: sessionThinking,
						totalTokens: sessionTotal,
					}
					sessionQuota = {
						inputTokens: sessionInput,
						outputTokens: sessionOutput,
						thinkingTokens: sessionThinking,
						totalTokens: sessionTotal,
						turnsCount: sessionTurns,
						messagesCount: sessionMessages,
						tokenLimit: SESSION_TOKEN_LIMIT,
						tokensRemaining: Math.max(0, SESSION_TOKEN_LIMIT - sessionTotal),
						percentUsed: Math.min(100, Math.round((sessionTotal / SESSION_TOKEN_LIMIT) * 100)),
						activeModel: session.model,
						updatedAt: session.updatedAt,
					}
					activeModel = session.model
				}
			}

			const weeklyQuota: AgyQuotaUsage['weeklyQuota'] = {
				inputTokens: weeklyTokens.inputTokens,
				outputTokens: weeklyTokens.outputTokens,
				thinkingTokens: weeklyTokens.thinkingTokens,
				totalTokens: weeklyTokens.totalTokens,
				promptsCount: weeklyTokens.promptsCount,
				tokenLimit: WEEKLY_TOKEN_LIMIT,
				tokensRemaining: Math.max(0, WEEKLY_TOKEN_LIMIT - weeklyTokens.totalTokens),
				percentUsed: Math.min(100, Math.round((weeklyTokens.totalTokens / WEEKLY_TOKEN_LIMIT) * 100)),
				resetAt: nextReset.toISOString(),
				resetSeconds: weeklyResetSeconds,
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
				sessionQuota,
				weeklyQuota,
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
