import { useEffect, useState } from 'react'
import type { Artifact, ArtifactType } from '@shared/types/artifact'
import {
	IconBack,
	IconChat,
	IconCheck,
	IconCopy,
	IconEdit,
	IconExport,
	IconEye,
	IconSave,
	IconTrash,
} from '../Icons'
import { CodeEditor } from '../editor/CodeEditor'
import { MarkdownRenderer } from '../MarkdownRenderer'
import { MermaidRenderer } from './MermaidRenderer'
import '../../styles/artifacts.css'

type ArtifactViewerProps = {
	artifact: Artifact
	onUpdate: (updated: Artifact) => Promise<void>
	onDelete: (id: string) => void
	onBack?: () => void
	onAskAgent?: (context: string) => void
	onExportToRepo?: (artifact: Artifact) => void
}

export function ArtifactViewer({
	artifact,
	onUpdate,
	onDelete,
	onBack,
	onAskAgent,
	onExportToRepo,
}: ArtifactViewerProps) {
	const [title, setTitle] = useState(artifact.title)
	const [type, setType] = useState<ArtifactType>(artifact.type)
	const [content, setContent] = useState(artifact.content)
	const [isEditing, setIsEditing] = useState(false)
	const [saving, setSaving] = useState(false)
	const [saveSuccess, setSaveSuccess] = useState(false)
	const [copied, setCopied] = useState(false)

	useEffect(() => {
		setTitle(artifact.title)
		setType(artifact.type)
		setContent(artifact.content)
		setIsEditing(false)
	}, [artifact])

	const isDirty =
		title !== artifact.title ||
		type !== artifact.type ||
		content !== artifact.content

	const handleSave = async () => {
		setSaving(true)
		try {
			await onUpdate({
				...artifact,
				title: title.trim() || 'Untitled Artifact',
				type,
				content,
				updatedAt: new Date().toISOString(),
			})
			setSaveSuccess(true)
			setIsEditing(false)
			setTimeout(() => setSaveSuccess(false), 2000)
		} finally {
			setSaving(false)
		}
	}

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(content)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// ignore
		}
	}

	const handleAskAgent = () => {
		const snippet = `[Artifact: "${title}" (ID: ${artifact.id}, Type: ${type})]\n\`\`\`${type}\n${content}\n\`\`\`\n`
		onAskAgent?.(snippet)
	}

	const getEditorLanguage = () => {
		if (type === 'markdown') return 'markdown.md'
		if (type === 'mermaid') return 'diagram.mmd'
		if (type === 'code') return artifact.language ? `code.${artifact.language}` : 'code.ts'
		return 'text.txt'
	}

	return (
		<div className="artifact-viewer">
			{/* Top Header Toolbar */}
			<div className="artifact-viewer__header">
				<div className="artifact-viewer__title-wrap">
					{onBack && (
						<button
							type="button"
							className="artifact-back-btn"
							onClick={onBack}
							aria-label="Back to artifacts list"
						>
							<IconBack className="artifact-back-btn__icon" />
						</button>
					)}
					{isEditing ? (
						<input
							type="text"
							className="artifact-title-input"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Artifact Title"
						/>
					) : (
						<h2 className="artifact-viewer__title">{title}</h2>
					)}
					<span className={`artifact-badge artifact-badge--${type}`}>{type}</span>
				</div>

				<div className="artifact-viewer__actions">
					{/* Toggle View / Edit */}
					<button
						type="button"
						className={`artifact-action-btn${isEditing ? ' is-active' : ''}`}
						onClick={() => setIsEditing(!isEditing)}
						title={isEditing ? 'View Preview' : 'Edit Artifact'}
					>
						{isEditing ? (
							<>
								<IconEye className="artifact-action-btn__icon" />
								<span>Preview</span>
							</>
						) : (
							<>
								<IconEdit className="artifact-action-btn__icon" />
								<span>Edit</span>
							</>
						)}
					</button>

					{/* Save button if dirty or editing */}
					{(isEditing || isDirty) && (
						<button
							type="button"
							className={`artifact-action-btn artifact-action-btn--save${isDirty ? ' is-dirty' : ''}`}
							onClick={() => void handleSave()}
							disabled={saving}
							title="Save changes to artifact"
						>
							{saveSuccess ? (
								<>
									<IconCheck className="artifact-action-btn__icon" />
									<span>Saved</span>
								</>
							) : (
								<>
									<IconSave className="artifact-action-btn__icon" />
									<span>{saving ? 'Saving…' : 'Save'}</span>
								</>
							)}
						</button>
					)}

					{/* Ask Agent */}
					<button
						type="button"
						className="artifact-action-btn artifact-action-btn--ask"
						onClick={handleAskAgent}
						title="Send artifact context to Agent Chat"
					>
						<IconChat className="artifact-action-btn__icon" />
						<span>Ask Agent</span>
					</button>

					{/* Save to Repo */}
					{onExportToRepo && (
						<button
							type="button"
							className="artifact-action-btn"
							onClick={() => onExportToRepo(artifact)}
							title="Save / Export into repository"
						>
							<IconExport className="artifact-action-btn__icon" />
							<span>Export</span>
						</button>
					)}

					{/* Copy */}
					<button
						type="button"
						className="artifact-action-btn artifact-action-btn--icon-only"
						onClick={() => void handleCopy()}
						title="Copy content"
						aria-label="Copy"
					>
						{copied ? (
							<IconCheck className="artifact-action-btn__icon" />
						) : (
							<IconCopy className="artifact-action-btn__icon" />
						)}
					</button>

					{/* Delete */}
					<button
						type="button"
						className="artifact-action-btn artifact-action-btn--danger artifact-action-btn--icon-only"
						onClick={() => onDelete(artifact.id)}
						title="Delete artifact"
						aria-label="Delete"
					>
						<IconTrash className="artifact-action-btn__icon" />
					</button>
				</div>
			</div>

			{/* Viewer / Editor Body */}
			<div className="artifact-viewer__body">
				{isEditing ? (
					<div className="artifact-editor-container">
						<CodeEditor
							content={content}
							filePath={getEditorLanguage()}
							onChange={setContent}
							onSave={() => void handleSave()}
						/>
					</div>
				) : type === 'mermaid' ? (
					<div className="artifact-mermaid-view">
						<MermaidRenderer chart={content} />
					</div>
				) : type === 'markdown' ? (
					<div className="artifact-markdown-view">
						<MarkdownRenderer content={content} />
					</div>
				) : type === 'code' ? (
					<div className="artifact-code-view">
						<CodeEditor
							content={content}
							filePath={getEditorLanguage()}
							onChange={() => {}}
							readOnly
						/>
					</div>
				) : (
					<pre className="artifact-text-view">{content}</pre>
				)}
			</div>
		</div>
	)
}
