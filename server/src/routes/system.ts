import { Router } from 'express'
import { asyncHandler } from '../middleware.js'
import type { ServerConfig } from '../config.js'
import { ServerUpdateService } from '../services/serverUpdateService.js'

export function createSystemRouter(config: ServerConfig): Router {
	const router = Router()
	const updater = new ServerUpdateService(config)

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
