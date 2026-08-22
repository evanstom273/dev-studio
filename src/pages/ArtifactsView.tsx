import { useCallback, useEffect, useState } from 'react'
import type { FileTreeNode } from '@shared/types/git'
import type { Project } from '@shared/types/project'
import type { Artifact, ArtifactType, CreateArtifactRequest } from '@shared/types/artifact'
import {
	IconArtifact,
	IconClose,
	IconFile,
	IconPlus,
	IconSearch,
} from '../components/Icons'
import { ArtifactList } from '../components/artifacts/ArtifactList'
import { ArtifactViewer } from '../components/artifacts/ArtifactViewer'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { agentApi } from '../services/agentApi'
import { artifactApi } from '../services/artifactApi'
import '../styles/artifacts.css'

type ArtifactsViewProps = {
	project: Project
	onSendToChat?: (contextText: string) => void
	onNavigateToChat?: () => void
	onOpenInEditor?: (filePath: string) => void
}

const STARTER_TEMPLATES: Record<ArtifactType, { title: string; content: string }> = {
	markdown: {
		title: 'Implementation Plan',
		content: `# Implementation Plan\n\n## Overview\nDescribe the purpose and goals.\n\n## Proposed Changes\n- [ ] Step 1: Initialize components\n- [ ] Step 2: Implement backend endpoint\n- [ ] Step 3: Wire frontend and verify\n\n## Verification Plan\n- Run \`npm run build\`\n- Run tests\n`,
	},
	mermaid: {
		title: 'System Architecture',
		content: `graph TD\n    Client[Mobile / Web Client] -->|HTTPS / Tailscale| Backend[Dev Studio Backend]\n    Backend -->|PTY / Shell| Terminal[Laptop Worker]\n    Backend -->|Filesystem| Files[Project Workspace]\n    Backend -->|CLI| Agent[Antigravity Agent]\n`,
	},
	code: {
		title: 'Schema Definition',
		content: `export interface UserProfile {\n  id: string;\n  name: string;\n  role: 'admin' | 'developer';\n  createdAt: string;\n}\n`,
	},
	text: {
		title: 'Research Notes',
		content: `Research Notes\n--------------\n- Findings from investigation\n- Key metrics and dependencies\n`,
	},
}

export function ArtifactsView({
	project,
	onSendToChat,
	onNavigateToChat,
	onOpenInEditor,
}: ArtifactsViewProps) {
	const isDesktop = useMediaQuery('(min-width: 1100px)')
	const [artifacts, setArtifacts] = useState<Artifact[]>([])
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	// Create Modal
	const [createModalOpen, setCreateModalOpen] = useState(false)
	const [newTitle, setNewTitle] = useState('')
	const [newType, setNewType] = useState<ArtifactType>('markdown')
	const [newContent, setNewContent] = useState('')

	// Export to Repo Modal
	const [exportModalOpen, setExportModalOpen] = useState(false)
	const [exportTargetArtifact, setExportTargetArtifact] = useState<Artifact | null>(null)
	const [exportPath, setExportPath] = useState('')
	const [exportSuccessPath, setExportSuccessPath] = useState<string | null>(null)

	// Import from Repo Modal
	const [importModalOpen, setImportModalOpen] = useState(false)
	const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
	const [importFilter, setImportFilter] = useState('')

	const loadArtifacts = useCallback(async () => {
		try {
			const list = await artifactApi.listArtifacts(project.id)
			setArtifacts(list)
			if (list.length > 0 && !selectedId && isDesktop) {
				setSelectedId(list[0].id)
			}
			setError(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load artifacts')
		}
	}, [isDesktop, project.id, selectedId])

	useEffect(() => {
		void loadArtifacts()
	}, [loadArtifacts])

	const handleOpenCreateModal = () => {
		const template = STARTER_TEMPLATES.markdown
		setNewTitle(template.title)
		setNewType('markdown')
		setNewContent(template.content)
		setCreateModalOpen(true)
	}

	const handleTypeChange = (type: ArtifactType) => {
		setNewType(type)
		const template = STARTER_TEMPLATES[type]
		if (template) {
			setNewTitle(template.title)
			setNewContent(template.content)
		}
	}

	const handleCreateArtifact = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newTitle.trim()) return

		try {
			const req: CreateArtifactRequest = {
				title: newTitle.trim(),
				type: newType,
				content: newContent,
			}
			const created = await artifactApi.createArtifact(project.id, req)
			setArtifacts((prev) => [created, ...prev])
			setSelectedId(created.id)
			setCreateModalOpen(false)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create artifact')
		}
	}

	const handleUpdateArtifact = async (updated: Artifact) => {
		try {
			const res = await artifactApi.updateArtifact(project.id, updated.id, {
				title: updated.title,
				type: updated.type,
				content: updated.content,
				language: updated.language,
			})
			setArtifacts((prev) => prev.map((a) => (a.id === res.id ? res : a)))
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save artifact')
		}
	}

	const handleDeleteArtifact = async (id: string) => {
		if (!confirm('Are you sure you want to delete this artifact?')) return

		try {
			await artifactApi.deleteArtifact(project.id, id)
			setArtifacts((prev) => prev.filter((a) => a.id !== id))
			if (selectedId === id) {
				setSelectedId(null)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete artifact')
		}
	}

	const handleStartExport = (artifact: Artifact) => {
		const defaultExt = artifact.type === 'markdown' ? 'md' : artifact.type === 'mermaid' ? 'mmd' : 'txt'
		const safeName = artifact.title.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
		setExportTargetArtifact(artifact)
		setExportPath(`docs/${safeName}.${defaultExt}`)
		setExportSuccessPath(null)
		setExportModalOpen(true)
	}

	const handleConfirmExport = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!exportTargetArtifact || !exportPath.trim()) return

		try {
			await artifactApi.saveToRepo(project.id, exportTargetArtifact.id, exportPath.trim())
			setExportSuccessPath(exportPath.trim())
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to export artifact to repository')
		}
	}

	const handleOpenImportModal = async () => {
		try {
			const tree = await agentApi.getFileTree(project.id)
			setFileTree(tree)
			setImportModalOpen(true)
		} catch {
			setError('Failed to load project files')
		}
	}

	const handleConfirmImport = async (sourcePath: string) => {
		try {
			const imported = await artifactApi.importFromRepo(project.id, sourcePath)
			setArtifacts((prev) => [imported, ...prev])
			setSelectedId(imported.id)
			setImportModalOpen(false)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to import file')
		}
	}

	const selectedArtifact = artifacts.find((a) => a.id === selectedId)

	// Flatten files for import modal
	const flattenedFiles = flattenTree(fileTree).filter((f) =>
		f.path.toLowerCase().includes(importFilter.toLowerCase()),
	)

	return (
		<div className="artifacts-view">
			{/* Error banner if any */}
			{error && <div className="artifacts-error">{error}</div>}

			{/* Master-Detail / Responsive Body */}
			<div className="artifacts-view__layout">
				{/* Left / List Column */}
				{(!selectedArtifact || isDesktop) && (
					<div className="artifacts-view__list-pane">
						<div className="artifacts-pane-header">
							<div className="artifacts-pane-header__title">
								<IconArtifact className="artifacts-pane-header__icon" />
								<span>Artifacts</span>
							</div>
							<button
								type="button"
								className="editor-btn editor-btn--secondary"
								onClick={() => void handleOpenImportModal()}
								title="Import file from project repository"
							>
								Import
							</button>
						</div>

						<ArtifactList
							artifacts={artifacts}
							selectedId={selectedId}
							onSelect={setSelectedId}
							onCreateNew={handleOpenCreateModal}
							onDelete={(id) => void handleDeleteArtifact(id)}
						/>
					</div>
				)}

				{/* Right / Detail Column */}
				{selectedArtifact ? (
					<div className="artifacts-view__detail-pane">
						<ArtifactViewer
							artifact={selectedArtifact}
							onUpdate={handleUpdateArtifact}
							onDelete={(id) => void handleDeleteArtifact(id)}
							onBack={!isDesktop ? () => setSelectedId(null) : undefined}
							onAskAgent={(snippet) => {
								onSendToChat?.(snippet)
								onNavigateToChat?.()
							}}
							onExportToRepo={handleStartExport}
						/>
					</div>
				) : isDesktop ? (
					<div className="artifacts-view__detail-pane artifacts-view__detail-pane--empty">
						<IconArtifact className="artifact-empty-state__icon" />
						<p className="artifact-empty-state__title">Select or create an artifact</p>
						<p className="artifact-empty-state__subtitle">
							Artifacts live independently of the chat transcript and persist across sessions.
						</p>
						<button
							type="button"
							className="editor-btn editor-btn--primary"
							onClick={handleOpenCreateModal}
						>
							<IconPlus className="editor-btn__icon" />
							New Artifact
						</button>
					</div>
				) : null}
			</div>

			{/* Create Artifact Modal */}
			{createModalOpen && (
				<div className="editor-modal-overlay">
					<form className="editor-modal" onSubmit={handleCreateArtifact}>
						<div className="editor-modal__header">
							<span className="editor-modal__title">Create New Artifact</span>
							<button
								type="button"
								className="editor-modal__close"
								onClick={() => setCreateModalOpen(false)}
							>
								<IconClose className="editor-modal__close-icon" />
							</button>
						</div>

						<div className="editor-modal__body">
							<div className="form-group">
								<label className="form-label">Type</label>
								<div className="type-selector-pills">
									{(['markdown', 'mermaid', 'code', 'text'] as ArtifactType[]).map((t) => (
										<button
											key={t}
											type="button"
											className={`type-pill${newType === t ? ' is-active' : ''}`}
											onClick={() => handleTypeChange(t)}
										>
											{t}
										</button>
									))}
								</div>
							</div>

							<div className="form-group">
								<label className="form-label">Title</label>
								<input
									type="text"
									className="editor-modal__input"
									value={newTitle}
									onChange={(e) => setNewTitle(e.target.value)}
									placeholder="Artifact title (e.g. Implementation Plan)..."
									autoFocus
									required
								/>
							</div>

							<div className="form-group">
								<label className="form-label">Initial Content</label>
								<textarea
									className="editor-modal__textarea"
									value={newContent}
									onChange={(e) => setNewContent(e.target.value)}
									rows={6}
								/>
							</div>
						</div>

						<div className="editor-modal__footer">
							<button
								type="button"
								className="editor-btn editor-btn--secondary"
								onClick={() => setCreateModalOpen(false)}
							>
								Cancel
							</button>
							<button type="submit" className="editor-btn editor-btn--primary">
								Create Artifact
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Export to Repo Modal */}
			{exportModalOpen && exportTargetArtifact && (
				<div className="editor-modal-overlay">
					<form className="editor-modal" onSubmit={handleConfirmExport}>
						<div className="editor-modal__header">
							<span className="editor-modal__title">Save to Repository</span>
							<button
								type="button"
								className="editor-modal__close"
								onClick={() => setExportModalOpen(false)}
							>
								<IconClose className="editor-modal__close-icon" />
							</button>
						</div>

						<div className="editor-modal__body">
							{exportSuccessPath ? (
								<div className="export-success">
									<p className="export-success__msg">
										Saved successfully to <code>{exportSuccessPath}</code> in repository!
									</p>
									{onOpenInEditor && (
										<button
											type="button"
											className="editor-btn editor-btn--primary"
											onClick={() => {
												setExportModalOpen(false)
												onOpenInEditor(exportSuccessPath)
											}}
										>
											Open in Code Editor
										</button>
									)}
								</div>
							) : (
								<>
									<p className="export-hint">
										Choose the repository path where this artifact should be saved.
									</p>
									<div className="form-group">
										<label className="form-label">Target Repository Path</label>
										<input
											type="text"
											className="editor-modal__input"
											value={exportPath}
											onChange={(e) => setExportPath(e.target.value)}
											placeholder="e.g. docs/plan.md"
											required
										/>
									</div>
								</>
							)}
						</div>

						<div className="editor-modal__footer">
							<button
								type="button"
								className="editor-btn editor-btn--secondary"
								onClick={() => setExportModalOpen(false)}
							>
								{exportSuccessPath ? 'Close' : 'Cancel'}
							</button>
							{!exportSuccessPath && (
								<button type="submit" className="editor-btn editor-btn--primary">
									Save to Repo
								</button>
							)}
						</div>
					</form>
				</div>
			)}

			{/* Import from Repo Modal */}
			{importModalOpen && (
				<div className="editor-modal-overlay">
					<div className="editor-modal" role="dialog" aria-label="Import file from repository">
						<div className="editor-modal__header">
							<span className="editor-modal__title">Import File as Artifact</span>
							<button
								type="button"
								className="editor-modal__close"
								onClick={() => setImportModalOpen(false)}
							>
								<IconClose className="editor-modal__close-icon" />
							</button>
						</div>

						<div className="editor-modal__search">
							<IconSearch className="editor-modal__search-icon" />
							<input
								type="text"
								className="editor-modal__input"
								placeholder="Filter files to import..."
								value={importFilter}
								onChange={(e) => setImportFilter(e.target.value)}
								autoFocus
							/>
						</div>

						<div className="editor-modal__file-list">
							{flattenedFiles.length === 0 ? (
								<div className="editor-modal__empty">No files found</div>
							) : (
								flattenedFiles.map((file) => (
									<button
										key={file.path}
										type="button"
										className="editor-modal__file-item"
										onClick={() => void handleConfirmImport(file.path)}
									>
										<IconFile className="editor-modal__file-icon" />
										<span className="editor-modal__file-name">{file.path}</span>
									</button>
								))
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

function flattenTree(nodes: FileTreeNode[]): { path: string; name: string }[] {
	const result: { path: string; name: string }[] = []
	function traverse(list: FileTreeNode[]) {
		for (const node of list) {
			if (node.kind === 'file') {
				result.push({ path: node.path, name: node.name })
			} else if (node.children) {
				traverse(node.children)
			}
		}
	}
	traverse(nodes)
	return result
}
