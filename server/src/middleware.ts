import type { NextFunction, Request, Response } from 'express'
import type { ServerConfig } from './config.js'

export function authMiddleware(config: ServerConfig) {
	return (req: Request, res: Response, next: NextFunction): void => {
		if (!config.token) {
			next()
			return
		}

		const header = req.headers.authorization
		const token = header?.startsWith('Bearer ') ? header.slice(7) : req.headers['x-dev-studio-token']

		if (token !== config.token) {
			res.status(401).json({ error: 'Unauthorized', code: 'INVALID_TOKEN' })
			return
		}

		next()
	}
}

export function asyncHandler(
	fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
	return (req: Request, res: Response, next: NextFunction): void => {
		fn(req, res, next).catch(next)
	}
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
	console.error('[dev-studio]', err)
	res.status(500).json({
		error: err.message || 'Internal server error',
		code: 'INTERNAL_ERROR',
	})
}
