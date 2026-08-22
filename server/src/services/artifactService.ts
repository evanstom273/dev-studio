import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ServerConfig } from '../config.js'
import type {
	Artifact,
	ArtifactType,
	CreateArtifactRequest,
	UpdateArtifactRequest,
} from '../types/artifact.js'
import { FileService } from './gitService.js'

export class ArtifactService {
	private readonly artifactsBaseDir: string
	private fileService = new FileService()

	constructor(config: ServerConfig) {
		this.artifactsBaseDir = join(config.dataDir, 'artifacts')
	}

	async init(): Promise<void> {
		await mkdir(this.artifactsBaseDir, { recursive: true })
	}

	private projectDir(projectId: string): string {
		return join(this.artifactsBaseDir, projectId)
	}

	private artifactPath(projectId: string, artifactId: string): string {
		// Clean artifactId to prevent traversal
		const safeId = artifactId.replace(/[^a-zA-Z0-9_-]/g, '_')
		return join(this.projectDir(projectId), `${safeId}.json`)
	}

	async list(projectId: string): Promise<Artifact[]> {
		const dir = this.projectDir(projectId)
		try {
			await mkdir(dir, { recursive: true })
			const files = await readdir(dir)
			const artifacts: Artifact[] = []
			for (const file of files) {
				if (!file.endsWith('.json')) continue
				try {
					const raw = await readFile(join(dir, file), 'utf8')
					const parsed = JSON.parse(raw) as Artifact
					artifacts.push(parsed)
				} catch {
					// skip invalid file
				}
			}
			return artifacts.sort(
				(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
			)
		} catch {
			return []
		}
	}

	async get(projectId: string, artifactId: string): Promise<Artifact | null> {
		try {
			const path = this.artifactPath(projectId, artifactId)
			const raw = await readFile(path, 'utf8')
			return JSON.parse(raw) as Artifact
		} catch {
			return null
		}
	}

	async create(projectId: string, req: CreateArtifactRequest): Promise<Artifact> {
		const dir = this.projectDir(projectId)
		await mkdir(dir, { recursive: true })

		const id = `art_${Date.now()}_${randomUUID().slice(0, 8)}`
		const now = new Date().toISOString()
		const artifact: Artifact = {
			id,
			projectId,
			title: req.title.trim() || 'Untitled Artifact',
			type: req.type || 'markdown',
			content: req.content ?? '',
			language: req.language,
			tags: req.tags ?? [],
			conversationId: req.conversationId,
			createdAt: now,
			updatedAt: now,
		}

		await this.writeAtomic(this.artifactPath(projectId, id), JSON.stringify(artifact, null, '\t'))
		return artifact
	}

	async update(
		projectId: string,
		artifactId: string,
		req: UpdateArtifactRequest,
	): Promise<Artifact | null> {
		const existing = await this.get(projectId, artifactId)
		if (!existing) return null

		const updated: Artifact = {
			...existing,
			title: req.title !== undefined ? req.title.trim() || 'Untitled Artifact' : existing.title,
			type: req.type !== undefined ? req.type : existing.type,
			content: req.content !== undefined ? req.content : existing.content,
			language: req.language !== undefined ? req.language : existing.language,
			tags: req.tags !== undefined ? req.tags : existing.tags,
			updatedAt: new Date().toISOString(),
		}

		await this.writeAtomic(
			this.artifactPath(projectId, artifactId),
			JSON.stringify(updated, null, '\t'),
		)
		return updated
	}

	async delete(projectId: string, artifactId: string): Promise<boolean> {
		try {
			const path = this.artifactPath(projectId, artifactId)
			await rm(path, { force: true })
			return true
		} catch {
			return false
		}
	}

	async saveToRepo(
		projectPath: string,
		projectId: string,
		artifactId: string,
		targetPath: string,
	): Promise<{ ok: boolean; path: string }> {
		const artifact = await this.get(projectId, artifactId)
		if (!artifact) {
			throw new Error('Artifact not found')
		}
		await this.fileService.write(projectPath, targetPath, artifact.content)
		return { ok: true, path: targetPath }
	}

	async importFromRepo(
		projectPath: string,
		projectId: string,
		sourcePath: string,
		title?: string,
	): Promise<Artifact> {
		const content = await this.fileService.read(projectPath, sourcePath)
		if (content === null) {
			throw new Error('Source file could not be read')
		}

		const cleanName = sourcePath.split(/[/\\]/).pop() ?? sourcePath
		const ext = cleanName.includes('.') ? cleanName.split('.').pop()?.toLowerCase() : ''

		let type: ArtifactType = 'text'
		let language: string | undefined

		if (ext === 'md' || ext === 'markdown') {
			type = 'markdown'
		} else if (ext === 'mmd' || ext === 'mermaid') {
			type = 'mermaid'
		} else if (
			['ts', 'tsx', 'js', 'jsx', 'json', 'py', 'rs', 'go', 'html', 'css', 'sql', 'yaml', 'yml'].includes(
				ext ?? '',
			)
		) {
			type = 'code'
			language = ext
		}

		return this.create(projectId, {
			title: title?.trim() || cleanName,
			type,
			content,
			language,
			tags: ['imported'],
		})
	}

	private async writeAtomic(path: string, content: string): Promise<void> {
		const tmp = `${path}.tmp`
		await writeFile(tmp, content, 'utf8')
		const { rename } = await import('node:fs/promises')
		await rename(tmp, path)
	}
}
