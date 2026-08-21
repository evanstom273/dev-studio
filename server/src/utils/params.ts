import type { Request } from 'express'

export function param(req: Request, name: string): string {
	const value = req.params[name]
	return Array.isArray(value) ? value[0] : value
}

export function queryParam(req: Request, name: string): string | undefined {
	const value = req.query[name]
	if (Array.isArray(value)) {
		const first = value[0]
		return typeof first === 'string' ? first : undefined
	}
	if (typeof value === 'string') return value
	return undefined
}
