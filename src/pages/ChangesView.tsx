import { useState } from 'react'
import { ChangesList, DiffView } from '../components/ChangesPanel'
import { IconBack } from '../components/Icons'
import { useWideLayout } from '../hooks/useMediaQuery'
import { MOCK_CHANGED_FILES, getMockDiff } from '../services/mockData'
import '../styles/panels.css'

export function ChangesView() {
	const [selectedPath, setSelectedPath] = useState<string | null>(null)
	const isWide = useWideLayout()
	const diff = selectedPath ? getMockDiff(selectedPath) : null
	const showDetail = isWide ? true : selectedPath !== null

	return (
		<div className="workspace-pane changes-layout">
			{(!isWide && selectedPath) ? (
				<div className="mobile-back-bar">
					<button
						type="button"
						className="mobile-back-bar__btn"
						onClick={() => setSelectedPath(null)}
					>
						<IconBack className="file-tree__icon" />
						Changes
					</button>
				</div>
			) : (
				<div className="panel-header">
					<h2 className="panel-header__title">Changes</h2>
				</div>
			)}

			<div className="changes-layout" style={{ flex: 1, minHeight: 0 }}>
				{(!isWide && selectedPath) ? null : (
					<div className="changes-list-panel">
						<ChangesList
							files={MOCK_CHANGED_FILES}
							selectedPath={selectedPath}
							onSelect={setSelectedPath}
						/>
					</div>
				)}

				{showDetail && (
					<DiffView diff={diff} />
				)}
			</div>
		</div>
	)
}
