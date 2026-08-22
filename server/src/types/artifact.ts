export type ArtifactType = 'markdown' | 'text' | 'code' | 'mermaid'

export type Artifact = {
	id: string
	projectId: string
	title: string
	type: ArtifactType
	content: string
	language?: string
	createdAt: string
	updatedAt: string
	conversationId?: string
	tags?: string[]
}

export type CreateArtifactRequest = {
	title: string
	type: ArtifactType
	content: string
	language?: string
	tags?: string[]
	conversationId?: string
}

export type UpdateArtifactRequest = {
	title?: string
	type?: ArtifactType
	content?: string
	language?: string
	tags?: string[]
}

export type SaveArtifactToRepoRequest = {
	targetPath: string
}

export type ImportArtifactFromRepoRequest = {
	sourcePath: string
	title?: string
}
