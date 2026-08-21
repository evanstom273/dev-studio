import { basename } from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { Project } from '../types/project.js'
import { ProjectRegistry } from '../store.js'
import type { ServerConfig } from '../config.js'
import { GitService } from './gitService.js'

export class ProjectService {
	private registry: ProjectRegistry
	private git: GitService

	constructor(config: ServerConfig) {
		this.registry = new ProjectRegistry(config)
		this.git = new GitService()
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
		const { mkdir } = await import('node:fs/promises')
		const { dirname } = await import('node:path')
		await mkdir(dirname(targetPath), { recursive: true })
		await this.git.clone(url, targetPath)
		return this.register(targetPath, name)
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

			return {
				id,
				name: overrideName ?? basename(path),
				path,
				repositoryLabel,
				lastActivity: '—',
				isGitRepo,
				hasRemote,
				defaultBranch,
			}
		} catch {
			return null
		}
	}
}
