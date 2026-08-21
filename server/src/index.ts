import cors from 'cors'
import express from 'express'
import { loadConfig } from './config.js'
import { authMiddleware, errorHandler } from './middleware.js'
import { createHealthRouter } from './routes/health.js'
import { createProjectsRouter } from './routes/projects.js'
import { createAgentRouter, createRunRouter } from './routes/agent.js'
import { createGitRouter, createFilesRouter } from './routes/git.js'
import { createGitHubRouter } from './routes/github.js'
import { ProjectService } from './services/projectService.js'
import { AgyService, PermissionQueue } from './services/agyService.js'
import { SessionStore } from './store.js'

const config = loadConfig()
const app = express()

const projects = new ProjectService(config)
const sessions = new SessionStore(config)
const permissions = new PermissionQueue()
const agy = new AgyService(config, sessions, permissions)

app.use(
	cors({
		origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins,
		credentials: true,
	}),
)
app.use(express.json({ limit: '1mb' }))

app.use('/api', authMiddleware(config))

app.use('/api', createHealthRouter(config))
app.use('/api/projects', createProjectsRouter(projects))
app.use('/api/agent', createAgentRouter(projects, agy, sessions, permissions))
app.use('/api/run', createRunRouter(projects))
app.use('/api/git', createGitRouter(projects))
app.use('/api/files', createFilesRouter(projects))
app.use('/api/github', createGitHubRouter(projects, config))

app.use(errorHandler)

async function main(): Promise<void> {
	await projects.init()
	await sessions.init()

	app.listen(config.port, config.host, () => {
		console.log(`Dev Studio backend listening on http://${config.host}:${config.port}`)
		console.log(`Projects root: ${config.projectsRoot}`)
		console.log(`Data dir: ${config.dataDir}`)
		if (!config.token) {
			console.warn('WARNING: DEV_STUDIO_TOKEN not set — API is unauthenticated')
		}
		if (!config.githubToken) {
			console.warn('INFO: No GitHub token on laptop — clients can send X-GitHub-Token from the phone app')
		}
	})
}

main().catch((err) => {
	console.error('Failed to start server:', err)
	process.exit(1)
})
