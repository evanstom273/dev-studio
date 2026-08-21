import { useState } from 'react'
import { FileContent, FileTree } from '../components/FilesPanel'
import { IconBack } from '../components/Icons'
import { useWideLayout } from '../hooks/useMediaQuery'
import { MOCK_FILE_TREE, findMockFileContent } from '../services/mockData'
import '../styles/panels.css'

export function FilesView() {
	const [selectedPath, setSelectedPath] = useState<string | null>(null)
	const isWide = useWideLayout()
	const content = selectedPath ? findMockFileContent(selectedPath) : null
	const showDetail = isWide ? true : selectedPath !== null

	return (
		<div className="workspace-pane files-layout">
			{(!isWide && selectedPath) ? (
				<div className="mobile-back-bar">
					<button
						type="button"
						className="mobile-back-bar__btn"
						onClick={() => setSelectedPath(null)}
					>
						<IconBack className="file-tree__icon" />
						Files
					</button>
				</div>
			) : (
				<div className="panel-header">
					<h2 className="panel-header__title">Files</h2>
				</div>
			)}

			<div className="files-layout" style={{ flex: 1, minHeight: 0 }}>
				{(!isWide && selectedPath) ? null : (
					<div className="file-tree-panel">
						<FileTree
							nodes={MOCK_FILE_TREE}
							selectedPath={selectedPath}
							onSelect={setSelectedPath}
						/>
					</div>
				)}

				{showDetail && (
					<FileContent content={content} path={selectedPath} />
				)}
			</div>
		</div>
	)
}
