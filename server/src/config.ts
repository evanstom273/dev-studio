import { homedir } from 'node:os'
import { join } from 'node:path'

export type ServerConfig = {
	host: string
	port: number
	token: string
	githubToken: string
	projectsRoot: string
	dataDir: string
	agyPath: string
	allowedOrigins: string[]
	autoApproveTools: boolean
}

function envInt(name: string, fallback: number): number {
	const value = process.env[name]
	if (!value) return fallback
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) ? parsed : fallback
}

export function loadConfig(): ServerConfig {
	const dataDir = process.env.DEV_STUDIO_DATA_DIR ?? join(homedir(), '.dev-studio')
	const projectsRoot = process.env.DEV_STUDIO_PROJECTS_ROOT ?? join(homedir(), 'projects')

	return {
		host: process.env.DEV_STUDIO_HOST ?? '0.0.0.0',
		port: envInt('DEV_STUDIO_PORT', 3847),
		token: process.env.DEV_STUDIO_TOKEN ?? '',
		githubToken: process.env.DEV_STUDIO_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? '',
		projectsRoot,
		dataDir,
		agyPath: process.env.AGY_PATH ?? 'agy',
		allowedOrigins: (process.env.DEV_STUDIO_CORS ?? '*').split(',').map((s) => s.trim()),
		autoApproveTools: process.env.DEV_STUDIO_AUTO_APPROVE === 'true',
	}
}
