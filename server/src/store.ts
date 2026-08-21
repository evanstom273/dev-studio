import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ServerConfig } from './config.js'
import type { AgentSession } from './types/agent.js'

export class SessionStore {
	private readonly sessionsDir: string

	constructor(config: ServerConfig) {
		this.sessionsDir = join(config.dataDir, 'sessions')
	}

	async init(): Promise<void> {
		await mkdir(this.sessionsDir, { recursive: true })
	}

	private pathFor(projectId: string): string {
		return join(this.sessionsDir, `${projectId}.json`)
	}

	async get(projectId: string): Promise<AgentSession | null> {
		try {
			const raw = await readFile(this.pathFor(projectId), 'utf8')
			return JSON.parse(raw) as AgentSession
		} catch {
			return null
		}
	}

	async getAll(): Promise<AgentSession[]> {
		try {
			const files = await readdir(this.sessionsDir)
			const sessions: AgentSession[] = []
			for (const file of files) {
				if (!file.endsWith('.json')) continue
				try {
					const raw = await readFile(join(this.sessionsDir, file), 'utf8')
					sessions.push(JSON.parse(raw) as AgentSession)
				} catch {
					// ignore malformed
				}
			}
			return sessions
		} catch {
			return []
		}
	}

	async save(session: AgentSession): Promise<void> {
		await this.writeAtomic(this.pathFor(session.projectId), JSON.stringify(session, null, '\t'))
	}

	async getOrCreate(projectId: string): Promise<AgentSession> {
		const existing = await this.get(projectId)
		if (existing) return existing

		const session: AgentSession = {
			projectId,
			conversationId: null,
			mode: 'agent',
			items: [],
			updatedAt: new Date().toISOString(),
		}
		await this.save(session)
		return session
	}

	private async writeAtomic(path: string, content: string): Promise<void> {
		const tmp = `${path}.tmp`
		await writeFile(tmp, content, 'utf8')
		const { rename } = await import('node:fs/promises')
		await rename(tmp, path)
	}
}

export class ProjectRegistry {
	private readonly registryPath: string
	private readonly projectsRoot: string

	constructor(config: ServerConfig) {
		this.registryPath = join(config.dataDir, 'projects.json')
		this.projectsRoot = config.projectsRoot
	}

	async init(): Promise<void> {
		await mkdir(this.projectsRoot, { recursive: true })
		await mkdir(dirname(this.registryPath), { recursive: true })
		try {
			await readFile(this.registryPath, 'utf8')
		} catch {
			await writeFile(this.registryPath, '[]', 'utf8')
		}
	}

	async listRegistered(): Promise<string[]> {
		try {
			const raw = await readFile(this.registryPath, 'utf8')
			return JSON.parse(raw) as string[]
		} catch {
			return []
		}
	}

	async register(path: string): Promise<void> {
		const paths = await this.listRegistered()
		if (!paths.includes(path)) {
			paths.push(path)
			await writeFile(this.registryPath, JSON.stringify(paths, null, '\t'), 'utf8')
		}
	}

	async unregister(path: string): Promise<void> {
		const paths = (await this.listRegistered()).filter((p) => p !== path)
		await writeFile(this.registryPath, JSON.stringify(paths, null, '\t'), 'utf8')
	}

	async discover(): Promise<string[]> {
		const found = new Set<string>()
		const registered = await this.listRegistered()
		for (const p of registered) found.add(p)

		async function walk(dir: string, depth: number): Promise<void> {
			if (depth > 3) return
			let entries: string[]
			try {
				entries = await readdir(dir)
			} catch {
				return
			}
			for (const entry of entries) {
				if (entry.startsWith('.') && entry !== '.git') continue
				const full = join(dir, entry)
				try {
					const info = await stat(full)
					if (!info.isDirectory()) continue
					if (entry === '.git') {
						found.add(dir)
						continue
					}
					const gitPath = join(full, '.git')
					try {
						const gitStat = await stat(gitPath)
						if (gitStat.isDirectory() || gitStat.isFile()) {
							found.add(full)
							continue
						}
					} catch {
						// not a git repo
					}
					await walk(full, depth + 1)
				} catch {
					// skip inaccessible
				}
			}
		}

		await walk(this.projectsRoot, 0)
		return [...found]
	}
}
