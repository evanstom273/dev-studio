import cors from 'cors'
import express from 'express'
import { loadConfig } from './config.js'
import { authMiddleware, errorHandler } from './middleware.js'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { createHealthRouter } from './routes/health.js'
import { createProjectsRouter } from './routes/projects.js'
import { createAgentRouter, createRunRouter } from './routes/agent.js'
import { createGitRouter, createFilesRouter } from './routes/git.js'
import { createGitHubRouter } from './routes/github.js'
import { createSystemRouter } from './routes/system.js'
import { createArtifactsRouter } from './routes/artifacts.js'
import { createTerminalRouter, setupTerminalWebSocket } from './routes/terminal.js'
import { ProjectService } from './services/projectService.js'
import { AgyService, PermissionQueue } from './services/agyService.js'
import { ArtifactService } from './services/artifactService.js'
import { TerminalSessionManager } from './services/terminalService.js'
import { SessionStore } from './store.js'

const config = loadConfig()
const app = express()

const projects = new ProjectService(config)
const sessions = new SessionStore(config)
const permissions = new PermissionQueue()
const artifacts = new ArtifactService(config)
const terminal = new TerminalSessionManager()
const agy = new AgyService(config, sessions, permissions)

app.use(
	cors({
		origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins,
		credentials: true,
		allowedHeaders: ['Content-Type', 'Authorization', 'X-GitHub-Token', 'X-Dev-Studio-Token'],
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	}),
)
app.use(express.json({ limit: '50mb' }))

app.use('/api', authMiddleware(config))

app.use('/api', createHealthRouter(config))
app.use('/api/projects', createProjectsRouter(projects, config))
app.use('/api/agent', createAgentRouter(projects, agy, sessions, permissions, config))
app.use('/api/run', createRunRouter(projects))
app.use('/api/git', createGitRouter(projects, config))
app.use('/api/files', createFilesRouter(projects))
app.use('/api/github', createGitHubRouter(projects, config))
app.use('/api/artifacts', createArtifactsRouter(projects, artifacts))
app.use('/api/terminal', createTerminalRouter(projects, terminal))
app.use('/api/system', createSystemRouter(config, agy, sessions))

app.use(errorHandler)

async function main(): Promise<void> {
	await projects.init()
	await sessions.init()
	await artifacts.init()
	await agy.init()

	const server = createServer(app)
	const wss = new WebSocketServer({ server, path: '/api/terminal/ws' })
	setupTerminalWebSocket(wss, terminal, config)

	server.listen(config.port, config.host, () => {
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

	server.on('error', (err: NodeJS.ErrnoException) => {
		if (err.code === 'EADDRINUSE') {
			console.error(
				`Port ${config.port} is already in use. Stop the other server first:\n` +
					`  Get-NetTCPConnection -LocalPort ${config.port} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`,
			)
		} else {
			console.error('Server failed to start:', err.message)
		}
		process.exit(1)
	})
}

main().catch((err) => {
	console.error('Failed to start server:', err)
	process.exit(1)
})
