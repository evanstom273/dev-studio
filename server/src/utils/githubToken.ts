import type { Request } from 'express'
import type { ServerConfig } from '../config.js'

export const GITHUB_TOKEN_HEADER = 'x-github-token'

export function resolveGitHubToken(req: Request, config: ServerConfig): string {
	const header = req.headers[GITHUB_TOKEN_HEADER]
	if (typeof header === 'string' && header.trim()) {
		return header.trim()
	}
	if (Array.isArray(header) && header[0]?.trim()) {
		return header[0].trim()
	}
	return config.githubToken
}
