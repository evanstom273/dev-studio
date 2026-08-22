import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileTreeNode } from '@shared/types/git'
import type { Project } from '@shared/types/project'
import {
	IconChat,
	IconCheck,
	IconClose,
	IconFile,
	IconFolder,
	IconRedo,
	IconSave,
	IconSearch,
	IconUndo,
} from '../components/Icons'
import { CodeEditor, type CodeEditorHandle } from '../components/editor/CodeEditor'
import { EditorTabs, type EditorTab } from '../components/editor/EditorTabs'
import { agentApi } from '../services/agentApi'
import { editorApi } from '../services/editorApi'
import '../styles/editor.css'

type EditorViewProps = {
	project: Project
	initialFilePath?: string | null
	onSendToChat?: (contextText: string) => void
	onNavigateToChat?: () => void
}

export function EditorView({
	project,
	initialFilePath,
	onSendToChat,
	onNavigateToChat,
}: EditorViewProps) {
	const [tabs, setTabs] = useState<EditorTab[]>([])
	const [activePath, setActivePath] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [saveSuccess, setSaveSuccess] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// File browser modal
	const [filePickerOpen, setFilePickerOpen] = useState(false)
	const [fileTree, setFileTree] = useState<FileTreeNode[]>([])
	const [filterText, setFilterText] = useState('')

	// Go to line modal
	const [gotoModalOpen, setGotoModalOpen] = useState(false)
	const [gotoLineInput, setGotoLineInput] = useState('')

	const editorRef = useRef<CodeEditorHandle>(null)

	const loadFileTree = useCallback(async () => {
		try {
			const tree = await agentApi.getFileTree(project.id)
			setFileTree(tree)
		} catch {
			// ignore tree loading error
		}
	}, [project.id])

	const openFile = useCallback(
		async (filePath: string) => {
			const cleanPath = filePath.replace(/^[/\\]+/, '')
			const existing = tabs.find((t) => t.path === cleanPath)
			if (existing) {
				setActivePath(cleanPath)
				setFilePickerOpen(false)
				return
			}

			try {
				const content = await agentApi.getFileContent(project.id, cleanPath)
				if (content === null) {
					setError(`Could not read file: ${cleanPath}`)
					return
				}
				const title = cleanPath.split(/[/\\]/).pop() ?? cleanPath
				const newTab: EditorTab = {
					path: cleanPath,
					title,
					content,
					savedContent: content,
					isDirty: false,
				}
				setTabs((prev) => [...prev, newTab])
				setActivePath(cleanPath)
				setFilePickerOpen(false)
				setError(null)
			} catch (err) {
				setError(err instanceof Error ? err.message : `Failed to open ${cleanPath}`)
			}
		},
		[project.id, tabs],
	)

	useEffect(() => {
		void loadFileTree()
	}, [loadFileTree])

	useEffect(() => {
		if (initialFilePath) {
			void openFile(initialFilePath)
		}
	}, [initialFilePath, openFile])

	const activeTab = tabs.find((t) => t.path === activePath)

	const handleContentChange = (newContent: string) => {
		if (!activePath) return
		setTabs((prev) =>
			prev.map((t) =>
				t.path === activePath
					? { ...t, content: newContent, isDirty: newContent !== t.savedContent }
					: t,
			),
		)
	}

	const handleSave = async () => {
		if (!activeTab || saving) return
		setSaving(true)
		setError(null)
		try {
			await editorApi.saveFile(project.id, activeTab.path, activeTab.content)
			setTabs((prev) =>
				prev.map((t) =>
					t.path === activeTab.path
						? { ...t, savedContent: t.content, isDirty: false }
						: t,
				),
			)
			setSaveSuccess(true)
			setTimeout(() => setSaveSuccess(false), 2000)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save file')
		} finally {
			setSaving(false)
		}
	};

	const handleCloseTab = (path: string) => {
		const target = tabs.find((t) => t.path === path)
		if (target?.isDirty) {
			if (!confirm(`Save changes to ${target.title} before closing?`)) {
				// User wants to discard
			} else {
				void handleSave()
			}
		}

		setTabs((prev) => {
			const filtered = prev.filter((t) => t.path !== path)
			if (activePath === path) {
				const nextTab = filtered[filtered.length - 1]
				setActivePath(nextTab ? nextTab.path : null)
			}
			return filtered
		})
	}

	const handleSendToChat = () => {
		if (!activeTab) return
		const selection = editorRef.current?.getSelection()
		let contextSnippet = ''

		if (selection && selection.text.trim()) {
			const range = selection.fromLine === selection.toLine
				? `L${selection.fromLine}`
				: `L${selection.fromLine}-${selection.toLine}`
			contextSnippet = `[Context: \`${activeTab.path}\` (${range})]\n\`\`\`\n${selection.text}\n\`\`\`\n`
		} else {
			contextSnippet = `[Context: \`${activeTab.path}\`]\n\`\`\`\n${activeTab.content}\n\`\`\`\n`
		}

		onSendToChat?.(contextSnippet)
		onNavigateToChat?.()
	}

	const handleGotoLine = (e: React.FormEvent) => {
		e.preventDefault()
		const lineNum = Number.parseInt(gotoLineInput, 10)
		if (!Number.isNaN(lineNum)) {
			editorRef.current?.gotoLine(lineNum)
		}
		setGotoModalOpen(false)
		setGotoLineInput('')
	}

	// Flatten tree for search
	const flattenedFiles = flattenTree(fileTree).filter((f) =>
		f.path.toLowerCase().includes(filterText.toLowerCase()),
	)

	return (
		<div className="editor-view">
			{/* Top Bar with Tabs and Actions */}
			<div className="editor-view__header">
				<EditorTabs
					tabs={tabs}
					activePath={activePath}
					onSelectTab={setActivePath}
					onCloseTab={handleCloseTab}
					onNewTab={() => setFilePickerOpen(true)}
				/>

				{activeTab && (
					<div className="editor-view__actions">
						<button
							type="button"
							className="editor-btn editor-btn--icon"
							onClick={() => editorRef.current?.undo()}
							title="Undo"
							aria-label="Undo"
						>
							<IconUndo className="editor-btn__icon" />
						</button>

						<button
							type="button"
							className="editor-btn editor-btn--icon"
							onClick={() => editorRef.current?.redo()}
							title="Redo"
							aria-label="Redo"
						>
							<IconRedo className="editor-btn__icon" />
						</button>

						<button
							type="button"
							className="editor-btn editor-btn--icon"
							onClick={() => setGotoModalOpen(true)}
							title="Go to Line (Ctrl+G)"
							aria-label="Go to line"
						>
							<span className="editor-btn__label-short">:G</span>
						</button>

						<button
							type="button"
							className="editor-btn editor-btn--ask"
							onClick={handleSendToChat}
							title="Send selected code to Agent Chat"
						>
							<IconChat className="editor-btn__icon" />
							<span className="editor-btn__text">Ask Agent</span>
						</button>

						<button
							type="button"
							className={`editor-btn editor-btn--save${activeTab.isDirty ? ' is-dirty' : ''}${saveSuccess ? ' is-saved' : ''}`}
							onClick={() => void handleSave()}
							disabled={saving}
							title="Save file (Ctrl+S)"
						>
							{saveSuccess ? (
								<>
									<IconCheck className="editor-btn__icon" />
									<span className="editor-btn__text">Saved</span>
								</>
							) : (
								<>
									<IconSave className="editor-btn__icon" />
									<span className="editor-btn__text">{saving ? 'Saving…' : 'Save'}</span>
								</>
							)}
						</button>
					</div>
				)}
			</div>

			{error && <div className="editor-view__error">{error}</div>}

			{/* Main Editor Body */}
			<div className="editor-view__body">
				{activeTab ? (
					<CodeEditor
						key={activeTab.path}
						ref={editorRef}
						content={activeTab.content}
						filePath={activeTab.path}
						onChange={handleContentChange}
						onSave={() => void handleSave()}
					/>
				) : (
					<div className="editor-empty-state">
						<IconFile className="editor-empty-state__icon" />
						<p className="editor-empty-state__title">No file open</p>
						<p className="editor-empty-state__subtitle">
							Select a file from your project to inspect or edit.
						</p>
						<button
							type="button"
							className="editor-empty-state__btn"
							onClick={() => setFilePickerOpen(true)}
						>
							<IconFolder className="editor-empty-state__btn-icon" />
							Browse Project Files
						</button>
					</div>
				)}
			</div>

			{/* File Picker Modal */}
			{filePickerOpen && (
				<div className="editor-modal-overlay">
					<div className="editor-modal" role="dialog" aria-label="Open file">
						<div className="editor-modal__header">
							<span className="editor-modal__title">Open Project File</span>
							<button
								type="button"
								className="editor-modal__close"
								onClick={() => setFilePickerOpen(false)}
								aria-label="Close modal"
							>
								<IconClose className="editor-modal__close-icon" />
							</button>
						</div>

						<div className="editor-modal__search">
							<IconSearch className="editor-modal__search-icon" />
							<input
								type="text"
								className="editor-modal__input"
								placeholder="Search files by name or path..."
								value={filterText}
								onChange={(e) => setFilterText(e.target.value)}
								autoFocus
							/>
						</div>

						<div className="editor-modal__file-list">
							{flattenedFiles.length === 0 ? (
								<div className="editor-modal__empty">No matching files</div>
							) : (
								flattenedFiles.map((file) => (
									<button
										key={file.path}
										type="button"
										className="editor-modal__file-item"
										onClick={() => void openFile(file.path)}
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

			{/* Go to Line Modal */}
			{gotoModalOpen && (
				<div className="editor-modal-overlay">
					<form className="editor-modal editor-modal--small" onSubmit={handleGotoLine}>
						<div className="editor-modal__header">
							<span className="editor-modal__title">Go to Line</span>
							<button
								type="button"
								className="editor-modal__close"
								onClick={() => setGotoModalOpen(false)}
							>
								<IconClose className="editor-modal__close-icon" />
							</button>
						</div>
						<div className="editor-modal__body">
							<input
								type="number"
								min="1"
								className="editor-modal__input"
								placeholder="Line number..."
								value={gotoLineInput}
								onChange={(e) => setGotoLineInput(e.target.value)}
								autoFocus
							/>
						</div>
						<div className="editor-modal__footer">
							<button
								type="button"
								className="editor-btn editor-btn--secondary"
								onClick={() => setGotoModalOpen(false)}
							>
								Cancel
							</button>
							<button type="submit" className="editor-btn editor-btn--primary">
								Go
							</button>
						</div>
					</form>
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
