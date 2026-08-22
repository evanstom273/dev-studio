import { basename, dirname, join, resolve } from 'node:path'
import { mkdir, rm, stat } from 'node:fs/promises'
import type { Project } from '../types/project.js'
import { ProjectRegistry } from '../store.js'
import type { ServerConfig } from '../config.js'
import { GitService } from './gitService.js'
import { GitHubRestClient } from './githubRestClient.js'

export class ProjectService {
	private registry: ProjectRegistry
	private git = new GitService()
	private config: ServerConfig

	constructor(config: ServerConfig) {
		this.config = config
		this.registry = new ProjectRegistry(config)
	}

	async init(): Promise<void> {
		await this.registry.init()
	}

	async list(): Promise<Project[]> {
		const paths = await this.registry.discover()
		const projects: Project[] = []

		for (const path of paths) {
			const project = await this.toProject(path)
			if (project) projects.push(project)
		}

		return projects.sort((a, b) => a.name.localeCompare(b.name))
	}

	async getById(id: string): Promise<Project | null> {
		const projects = await this.list()
		return projects.find((p) => p.id === id) ?? null
	}

	async getPath(id: string): Promise<string | null> {
		const project = await this.getById(id)
		return project?.path ?? null
	}

	async ensureAgentWorkspace(id: string, token?: string): Promise<{ path: string; project: Project }> {
		let project = await this.getById(id)
		if (!project) {
			throw new Error('Project not found')
		}

		if (project.githubFullName) {
			const [owner, repo] = project.githubFullName.split('/')
			if (owner && repo) {
				const isRepo = await this.git.isRepo(project.path)
				if (!isRepo) {
					if (!token) {
						throw new Error('GitHub token required — add it in Settings to clone this repository')
					}
					project = await this.openFromGitHub(owner, repo, token)
				}
			}
		}

		try {
			const s = await stat(project.path)
			if (!s.isDirectory()) {
				throw new Error(`Project workspace path is not a directory: ${project.path}`)
			}
		} catch (err) {
			if (err instanceof Error && err.message.includes('not a directory')) throw err
			throw new Error(`Project workspace folder does not exist or is inaccessible: ${project.path}`)
		}

		return { path: project.path, project }
	}

	async openLocalFolder(folderPath: string, name?: string): Promise<Project> {
		const normalized = resolve(folderPath)
		try {
			const s = await stat(normalized)
			if (!s.isDirectory()) {
				throw new Error(`Path is not a directory: ${normalized}`)
			}
		} catch (err) {
			if (err instanceof Error && err.message.includes('not a directory')) throw err
			throw new Error(`Folder does not exist or is inaccessible: ${normalized}`)
		}

		await this.registry.register(normalized)
		const project = await this.toProject(normalized, name)
		if (!project) throw new Error('Failed to open local project')
		return project
	}

	async register(path: string, name?: string): Promise<Project> {
		const normalized = resolve(path)
		await this.registry.register(normalized)
		const project = await this.toProject(normalized, name)
		if (!project) throw new Error('Invalid project path')
		return project
	}

	async unregister(id: string): Promise<void> {
		const project = await this.getById(id)
		if (project) await this.registry.unregister(project.path)
	}

	async initRepo(path: string, name?: string): Promise<Project> {
		const normalized = resolve(path)
		await mkdir(normalized, { recursive: true })
		await this.git.init(normalized)
		return this.register(normalized, name)
	}

	async clone(url: string, targetPath: string, name?: string): Promise<Project> {
		const normalized = resolve(targetPath)
		await mkdir(dirname(normalized), { recursive: true })
		await this.git.clone(url, normalized)
		return this.register(normalized, name)
	}

	async openFromGitHub(owner: string, repo: string, token: string): Promise<Project> {
		const workspacePath = this.workspacePath(owner, repo)
		const isRepo = await this.git.isRepo(workspacePath)

		if (!isRepo) {
			if (!token) {
				throw new Error('GitHub token required — add it in Settings')
			}
			const cloneUrl = `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${repo}.git`
			await mkdir(dirname(workspacePath), { recursive: true })
			await this.git.clone(cloneUrl, workspacePath)
		}

		await this.registry.register(workspacePath)
		return this.withGitHubCache(await this.requireProject(workspacePath, repo), owner, repo)
	}

	async createAndOpen(
		name: string,
		token: string,
		description?: string,
		isPrivate?: boolean,
	): Promise<Project> {
		if (!token) {
			throw new Error('GitHub token required — add it in Settings')
		}

		const client = new GitHubRestClient(token)
		const created = await client.createRepo({
			name,
			description,
			private: isPrivate,
			auto_init: true,
		})

		const owner = created.owner.login
		const workspacePath = this.workspacePath(owner, created.name)
		const isRepo = await this.git.isRepo(workspacePath)

		if (!isRepo) {
			const cloneUrl = `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${created.name}.git`
			await mkdir(dirname(workspacePath), { recursive: true })
			await this.git.clone(cloneUrl, workspacePath)
		}

		await this.registry.register(workspacePath)
		return this.withGitHubCache(await this.requireProject(workspacePath, created.name), owner, created.name)
	}

	async removeLocalCopy(id: string): Promise<void> {
		const project = await this.getById(id)
		if (!project) throw new Error('Project not found')

		await this.registry.unregister(project.path)

		// ONLY delete the workspace directory if it is a managed cache in ~/.dev-studio/workspaces!
		// NEVER delete an external local folder!
		if (this.isCachePath(project.path)) {
			await rm(project.path, { recursive: true, force: true })
		}
	}

	private workspacePath(owner: string, repo: string): string {
		return join(this.config.dataDir, 'workspaces', owner, repo)
	}

	private isCachePath(path: string): boolean {
		const root = resolve(join(this.config.dataDir, 'workspaces'))
		return resolve(path).startsWith(root)
	}

	private withGitHubCache(project: Project, owner: string, repo: string): Project {
		return {
			...project,
			storage: 'github-cache',
			workspaceSource: 'managed',
			githubFullName: `${owner}/${repo}`,
			repositoryLabel: `github.com/${owner}/${repo}`,
			hasRemote: true,
		}
	}

	private async requireProject(path: string, name?: string): Promise<Project> {
		const project = await this.toProject(path, name)
		if (!project) throw new Error('Failed to open project')
		return project
	}

	private async toProject(path: string, overrideName?: string): Promise<Project | null> {
		try {
			const normalized = resolve(path)
			const id = Buffer.from(normalized).toString('base64url')
			const cachePath = this.isCachePath(normalized)
			const githubFullName = cachePath ? this.githubFullNameFromPath(normalized) : undefined
			const workspaceSource: 'local' | 'managed' = cachePath ? 'managed' : 'local'

			let exists = false
			try {
				const s = await stat(normalized)
				exists = s.isDirectory()
			} catch {
				exists = false
			}

			if (!exists) {
				return {
					id,
					name: overrideName ?? basename(normalized),
					path: normalized,
					lastActivity: '—',
					isGitRepo: false,
					hasRemote: false,
					storage: cachePath ? 'github-cache' : 'local',
					workspaceSource,
					githubFullName,
					exists: false,
				}
			}

			const isGitRepo = await this.git.isRepo(normalized)
			const hasRemote = isGitRepo ? await this.git.hasRemote(normalized) : false
			const defaultBranch = isGitRepo ? await this.git.getDefaultBranch(normalized) : undefined

			let repositoryLabel: string | undefined
			if (hasRemote) {
				try {
					const { simpleGit } = await import('simple-git')
					const remotes = await simpleGit({ baseDir: normalized }).getRemotes(true)
					const origin = remotes.find((r) => r.name === 'origin')
					repositoryLabel = origin?.refs.fetch ?? origin?.refs.push
				} catch {
					repositoryLabel = undefined
				}
			}

			return {
				id,
				name: overrideName ?? basename(normalized),
				path: normalized,
				repositoryLabel,
				lastActivity: '—',
				isGitRepo,
				hasRemote,
				defaultBranch,
				storage: cachePath ? 'github-cache' : 'local',
				workspaceSource,
				githubFullName,
				exists: true,
			}
		} catch {
			return null
		}
	}

	private githubFullNameFromPath(path: string): string | undefined {
		const root = resolve(join(this.config.dataDir, 'workspaces'))
		const normalized = resolve(path)
		if (!normalized.startsWith(root)) return undefined
		const relativePath = normalized.slice(root.length + 1)
		const parts = relativePath.split(/[/\\]/).filter(Boolean)
		if (parts.length < 2) return undefined
		return `${parts[0]}/${parts[1]}`
	}
}
