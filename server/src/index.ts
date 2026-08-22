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
import { createProcessesRouter } from './routes/processes.js'
import { createProblemsRouter } from './routes/problems.js'
import { createPlansRouter } from './routes/plans.js'
import { createBrowserRouter, setupBrowserWebSocket } from './routes/browser.js'
import { ProjectService } from './services/projectService.js'
import { AgyService, PermissionQueue } from './services/agyService.js'
import { ArtifactService } from './services/artifactService.js'
import { TerminalSessionManager } from './services/terminalService.js'
import { ProcessService } from './services/processService.js'
import { ProblemService } from './services/problemService.js'
import { PlanService } from './services/planService.js'
import { BrowserService } from './services/browserService.js'
import { SessionStore } from './store.js'

const config = loadConfig()
const app = express()

const projects = new ProjectService(config)
const sessions = new SessionStore(config)
const permissions = new PermissionQueue()
const artifacts = new ArtifactService(config)
const terminal = new TerminalSessionManager()
const processes = new ProcessService(config, terminal)
const problems = new ProblemService(config)
const plans = new PlanService(config)
const browser = new BrowserService(config)
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
app.use('/api/processes', createProcessesRouter(projects, processes, config))
app.use('/api/problems', createProblemsRouter(projects, problems, config))
app.use('/api/plans', createPlansRouter(plans, artifacts))
app.use('/api/browser', createBrowserRouter(browser))
app.use('/api/system', createSystemRouter(config, agy, sessions))

app.use(errorHandler)

async function main(): Promise<void> {
	await projects.init()
	await sessions.init()
	await artifacts.init()
	await problems.init()
	await plans.init()
	await browser.init()
	await agy.init()

	const server = createServer(app)
	const terminalWss = new WebSocketServer({ noServer: true })
	setupTerminalWebSocket(terminalWss, terminal, config)

	const browserWss = new WebSocketServer({ noServer: true })
	setupBrowserWebSocket(browserWss, browser, config)

	server.on('upgrade', (req, socket, head) => {
		try {
			const parsedUrl = new URL(req.url ?? '', `http://${req.headers.host || 'localhost'}`)
			const pathname = parsedUrl.pathname

			if (pathname === '/api/terminal/ws') {
				terminalWss.handleUpgrade(req, socket, head, (ws) => {
					terminalWss.emit('connection', ws, req)
				})
			} else if (pathname === '/api/browser/ws') {
				browserWss.handleUpgrade(req, socket, head, (ws) => {
					browserWss.emit('connection', ws, req)
				})
			} else {
				socket.destroy()
			}
		} catch {
			socket.destroy()
		}
	})

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
