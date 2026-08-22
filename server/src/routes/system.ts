import { Router } from 'express'
import { freemem, totalmem, uptime, platform } from 'node:os'
import { asyncHandler } from '../middleware.js'
import type { ServerConfig } from '../config.js'
import type { AgentRouterService } from '../services/agent/agentRouterService.js'
import type { SessionStore } from '../store.js'
import { ServerUpdateService } from '../services/serverUpdateService.js'
import { fetchAgyQuota, summarizeQuotaHealth } from '../services/agyQuotaService.js'
import { fetchCodexQuota } from '../services/codexQuotaService.js'
import { checkAgyAuth } from '../utils/exec.js'
import { queryParam } from '../utils/params.js'
import type { AgyQuotaUsage } from '../types/system.js'

export function createSystemRouter(
	config: ServerConfig,
	agentService: AgentRouterService,
	sessions: SessionStore,
): Router {
	const router = Router()
	const updater = new ServerUpdateService(config)

	router.get(
		'/quota',
		asyncHandler(async (req, res) => {
			const projectId = queryParam(req, 'projectId')
			const refresh = queryParam(req, 'refresh') === '1'

			const [authStatus, availableModelsData, providers, allSessions] = await Promise.all([
				checkAgyAuth(config.agyPath),
				agentService.getAvailableModels().catch(() => ({ models: [], modelDefinitions: [] })),
				agentService.getProviderStatuses().catch(() => []),
				sessions.getAll(),
			])

			const availableModels = availableModelsData.models

			let quota: AgyQuotaUsage['quota']
			let quotaError: string | undefined
			if (authStatus.available) {
				try {
					quota = await fetchAgyQuota({ agyPath: config.agyPath, refresh })
				} catch (error) {
					quotaError = error instanceof Error ? error.message : 'Failed to fetch Antigravity quota'
				}
			} else {
				quotaError = authStatus.message ?? 'Antigravity CLI is not available on this laptop'
			}

			let codexQuota: AgyQuotaUsage['codexQuota']
			let codexQuotaError: string | undefined
			try {
				const codexSnapshot = await fetchCodexQuota({ refresh })
				if (codexSnapshot) {
					codexQuota = codexSnapshot
				}
			} catch (error) {
				codexQuotaError = error instanceof Error ? error.message : 'Failed to fetch Codex quota'
			}

			let activeModel: string | undefined
			if (projectId) {
				const session = allSessions.find((entry) => entry.projectId === projectId)
				activeModel = session?.model || undefined
			}
			if (!activeModel) {
				activeModel = availableModels[0]
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
				quota,
				quotaError,
				quotaHealth: quota ? summarizeQuotaHealth(quota) : undefined,
				codexQuota,
				codexQuotaError,
				codexQuotaHealth: codexQuota ? summarizeQuotaHealth(codexQuota) : undefined,
				activeModel,
				availableModels,
				providers,
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
