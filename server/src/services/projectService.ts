import { basename, dirname, join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
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

	async register(path: string, name?: string): Promise<Project> {
		await this.registry.register(path)
		const project = await this.toProject(path, name)
		if (!project) throw new Error('Invalid project path')
		return project
	}

	async unregister(id: string): Promise<void> {
		const project = await this.getById(id)
		if (project) await this.registry.unregister(project.path)
	}

	async initRepo(path: string, name?: string): Promise<Project> {
		await mkdir(path, { recursive: true })
		await this.git.init(path)
		return this.register(path, name)
	}

	async clone(url: string, targetPath: string, name?: string): Promise<Project> {
		await mkdir(dirname(targetPath), { recursive: true })
		await this.git.clone(url, targetPath)
		return this.register(targetPath, name)
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
		await rm(project.path, { recursive: true, force: true })
	}

	private workspacePath(owner: string, repo: string): string {
		return join(this.config.dataDir, 'workspaces', owner, repo)
	}

	private isCachePath(path: string): boolean {
		const root = join(this.config.dataDir, 'workspaces')
		return path.startsWith(root)
	}

	private withGitHubCache(project: Project, owner: string, repo: string): Project {
		return {
			...project,
			storage: 'github-cache',
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
			const isGitRepo = await this.git.isRepo(path)
			const hasRemote = isGitRepo ? await this.git.hasRemote(path) : false
			const defaultBranch = isGitRepo ? await this.git.getDefaultBranch(path) : undefined

			let repositoryLabel: string | undefined
			if (hasRemote) {
				try {
					const { simpleGit } = await import('simple-git')
					const remotes = await simpleGit({ baseDir: path }).getRemotes(true)
					const origin = remotes.find((r) => r.name === 'origin')
					repositoryLabel = origin?.refs.fetch ?? origin?.refs.push
				} catch {
					repositoryLabel = undefined
				}
			}

			const id = Buffer.from(path).toString('base64url')
			const cachePath = this.isCachePath(path)
			const githubFullName = cachePath ? this.githubFullNameFromPath(path) : undefined

			return {
				id,
				name: overrideName ?? basename(path),
				path,
				repositoryLabel,
				lastActivity: '—',
				isGitRepo,
				hasRemote,
				defaultBranch,
				storage: cachePath ? 'github-cache' : 'local',
				githubFullName,
			}
		} catch {
			return null
		}
	}

	private githubFullNameFromPath(path: string): string | undefined {
		const root = join(this.config.dataDir, 'workspaces')
		if (!path.startsWith(root)) return undefined
		const relative = path.slice(root.length + 1)
		const parts = relative.split(/[/\\]/).filter(Boolean)
		if (parts.length < 2) return undefined
		return `${parts[0]}/${parts[1]}`
	}
}
