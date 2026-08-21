import { useCallback, useEffect, useState } from 'react'
import type { ChangedFile, FileDiff } from '@shared/types/git'
import type { Project } from '@shared/types/project'
import { ChangesList, DiffView } from '../components/ChangesPanel'
import { IconBack } from '../components/Icons'
import { useWideLayout } from '../hooks/useMediaQuery'
import { agentApi } from '../services/agentApi'
import { gitApi } from '../services/gitApi'
import '../styles/panels.css'

type ChangesViewProps = {
	project: Project
}

export function ChangesView({ project }: ChangesViewProps) {
	const [files, setFiles] = useState<ChangedFile[]>([])
	const [selectedPath, setSelectedPath] = useState<string | null>(null)
	const [diff, setDiff] = useState<FileDiff | null>(null)
	const [loading, setLoading] = useState(false)
	const [message, setMessage] = useState('')
	const isWide = useWideLayout()

	const loadChanges = useCallback(async () => {
		setLoading(true)
		try {
			const changed = await agentApi.listChanges(project.id)
			setFiles(changed)
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Failed to load changes')
		} finally {
			setLoading(false)
		}
	}, [project.id])

	useEffect(() => {
		void loadChanges()
	}, [loadChanges])

	useEffect(() => {
		if (!selectedPath) {
			setDiff(null)
			return
		}
		void agentApi.getDiff(project.id, selectedPath).then(setDiff).catch(() => setDiff(null))
	}, [project.id, selectedPath])

	const handleStage = async (path: string) => {
		await gitApi.stage(project.id, { paths: [path] })
		void loadChanges()
	}

	const handleDiscard = async (path: string) => {
		if (!confirm(`Discard changes to ${path}?`)) return
		await gitApi.discard(project.id, { paths: [path] })
		setSelectedPath(null)
		void loadChanges()
	}

	const handleCommit = async () => {
		const msg = prompt('Commit message:')
		if (!msg?.trim()) return
		await gitApi.commit(project.id, { message: msg.trim() })
		void loadChanges()
	}

	const showDetail = isWide ? true : selectedPath !== null

	return (
		<div className="workspace-pane changes-layout">
			{(!isWide && selectedPath) ? (
				<div className="mobile-back-bar">
					<button type="button" className="mobile-back-bar__btn" onClick={() => setSelectedPath(null)}>
						<IconBack className="file-tree__icon" />
						Changes
					</button>
				</div>
			) : (
				<div className="panel-header panel-header--actions">
					<h2 className="panel-header__title">Changes</h2>
					<div className="panel-header__buttons">
						<button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadChanges()} disabled={loading}>
							Refresh
						</button>
						<button type="button" className="btn btn--primary btn--sm" onClick={() => void handleCommit()}>
							Commit
						</button>
					</div>
				</div>
			)}

			{message && <div className="panel-message">{message}</div>}

			<div className="changes-layout" style={{ flex: 1, minHeight: 0 }}>
				{(!isWide && selectedPath) ? null : (
					<div className="changes-list-panel">
						<ChangesList
							files={files}
							selectedPath={selectedPath}
							onSelect={setSelectedPath}
							onStage={(path) => void handleStage(path)}
							onDiscard={(path) => void handleDiscard(path)}
						/>
					</div>
				)}
				{showDetail && <DiffView diff={diff} />}
			</div>
		</div>
	)
}
