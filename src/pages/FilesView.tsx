import { useCallback, useEffect, useState } from 'react'
import type { FileTreeNode } from '@shared/types/git'
import type { Project } from '@shared/types/project'
import { FileContent, FileTree } from '../components/FilesPanel'
import { IconBack } from '../components/Icons'
import { useWideLayout } from '../hooks/useMediaQuery'
import { agentApi } from '../services/agentApi'
import '../styles/panels.css'

type FilesViewProps = {
	project: Project
	onOpenInEditor?: (filePath: string) => void
}

export function FilesView({ project, onOpenInEditor }: FilesViewProps) {
	const [tree, setTree] = useState<FileTreeNode[]>([])
	const [selectedPath, setSelectedPath] = useState<string | null>(null)
	const [content, setContent] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const isWide = useWideLayout()

	const loadTree = useCallback(async () => {
		try {
			setTree(await agentApi.getFileTree(project.id))
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load files')
		}
	}, [project.id])

	useEffect(() => {
		void loadTree()
	}, [loadTree])

	useEffect(() => {
		if (!selectedPath) {
			setContent(null)
			return
		}
		void agentApi.getFileContent(project.id, selectedPath).then(setContent).catch(() => setContent(null))
	}, [project.id, selectedPath])

	const showDetail = isWide ? true : selectedPath !== null

	return (
		<div className="workspace-pane files-layout">
			{(!isWide && selectedPath) ? (
				<div className="mobile-back-bar">
					<button type="button" className="mobile-back-bar__btn" onClick={() => setSelectedPath(null)}>
						<IconBack className="file-tree__icon" />
						Files
					</button>
				</div>
			) : (
				<div className="panel-header">
					<h2 className="panel-header__title">Files</h2>
				</div>
			)}

			{error && <div className="panel-message">{error}</div>}

			<div className="files-layout" style={{ flex: 1, minHeight: 0 }}>
				{(!isWide && selectedPath) ? null : (
					<div className="file-tree-panel">
						<FileTree nodes={tree} selectedPath={selectedPath} onSelect={setSelectedPath} />
					</div>
				)}
				{showDetail && (
					<FileContent
						content={content}
						path={selectedPath}
						onOpenInEditor={onOpenInEditor}
					/>
				)}
			</div>
		</div>
	)
}
