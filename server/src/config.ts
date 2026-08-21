import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
	installPath: string
	restartCommand: string
	gitBranch: string
	allowRemoteUpdate: boolean
}

function detectInstallPath(): string {
	const entry = fileURLToPath(import.meta.url)
	return resolve(dirname(entry), '..', '..')
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
		installPath: process.env.DEV_STUDIO_INSTALL_PATH ?? detectInstallPath(),
		restartCommand: process.env.DEV_STUDIO_RESTART_COMMAND ?? 'npm run start:server',
		gitBranch: process.env.DEV_STUDIO_GIT_BRANCH ?? 'main',
		allowRemoteUpdate: process.env.DEV_STUDIO_ALLOW_REMOTE_UPDATE !== 'false',
	}
}
