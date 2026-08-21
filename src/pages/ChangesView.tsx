import { useCallback, useEffect, useState } from 'react'
import type { ChangedFile, FileDiff } from '@shared/types/git'
import type { Project } from '@shared/types/project'
import { ChangesList, CommitSheet, DiffView } from '../components/ChangesPanel'
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
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [message, setMessage] = useState<string | null>(null)
	const [showCommitSheet, setShowCommitSheet] = useState(false)
	const [commitError, setCommitError] = useState<string | null>(null)
	const isWide = useWideLayout()

	const stagedCount = files.filter((f) => f.staged).length
	const unstagedCount = files.filter((f) => !f.staged).length

	const loadChanges = useCallback(async () => {
		setLoading(true)
		try {
			const changed = await agentApi.listChanges(project.id)
			setFiles(changed)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load changes')
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
		void agentApi
			.getDiff(project.id, selectedPath)
			.then(setDiff)
			.catch(() => setDiff(null))
	}, [project.id, selectedPath])

	const clearAlerts = () => {
		setError(null)
		setMessage(null)
	}

	const handleStage = async (path: string) => {
		clearAlerts()
		setBusy(true)
		try {
			await gitApi.stage(project.id, { paths: [path] })
			setMessage(`Staged ${path}`)
			await loadChanges()
		} catch (err) {
			setError(err instanceof Error ? err.message : `Failed to stage ${path}`)
		} finally {
			setBusy(false)
		}
	}

	const handleUnstage = async (path: string) => {
		clearAlerts()
		setBusy(true)
		try {
			await gitApi.unstage(project.id, { paths: [path] })
			setMessage(`Unstaged ${path}`)
			await loadChanges()
		} catch (err) {
			setError(err instanceof Error ? err.message : `Failed to unstage ${path}`)
		} finally {
			setBusy(false)
		}
	}

	const handleStageAll = async () => {
		clearAlerts()
		setBusy(true)
		try {
			await gitApi.stageAll(project.id)
			setMessage('All changes staged')
			await loadChanges()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to stage all changes')
		} finally {
			setBusy(false)
		}
	}

	const handleUnstageAll = async () => {
		clearAlerts()
		setBusy(true)
		try {
			await gitApi.unstageAll(project.id)
			setMessage('All files unstaged')
			await loadChanges()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to unstage files')
		} finally {
			setBusy(false)
		}
	}

	const handleDiscard = async (path: string) => {
		clearAlerts()
		if (!confirm(`Discard all changes to "${path}"? This cannot be undone.`)) return
		setBusy(true)
		try {
			await gitApi.discard(project.id, { paths: [path] })
			if (selectedPath === path) setSelectedPath(null)
			setMessage(`Discarded changes to ${path}`)
			await loadChanges()
		} catch (err) {
			setError(err instanceof Error ? err.message : `Failed to discard ${path}`)
		} finally {
			setBusy(false)
		}
	}

	const handleCommitSubmit = async (commitMsg: string, stageAllFirst: boolean) => {
		setCommitError(null)
		setBusy(true)
		try {
			if (stageAllFirst && unstagedCount > 0) {
				await gitApi.stageAll(project.id)
			}
			const result = await gitApi.commit(project.id, { message: commitMsg })
			setShowCommitSheet(false)
			setMessage(`Committed ${result.hash.slice(0, 7)}: ${commitMsg}`)
			await loadChanges()
		} catch (err) {
			const errText = err instanceof Error ? err.message : 'Commit failed'
			setCommitError(errText)
			setError(errText)
		} finally {
			setBusy(false)
		}
	}

	const showDetail = isWide ? true : selectedPath !== null

	return (
		<div className="workspace-pane changes-layout">
			{!isWide && selectedPath ? (
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
				<div className="panel-header panel-header--actions">
					<h2 className="panel-header__title">Changes</h2>
					<div className="panel-header__buttons">
						{unstagedCount > 0 && (
							<button
								type="button"
								className="btn btn--ghost btn--sm"
								onClick={() => void handleStageAll()}
								disabled={loading || busy}
							>
								Stage all
							</button>
						)}
						{stagedCount > 0 && (
							<button
								type="button"
								className="btn btn--ghost btn--sm"
								onClick={() => void handleUnstageAll()}
								disabled={loading || busy}
							>
								Unstage all
							</button>
						)}
						<button
							type="button"
							className="btn btn--ghost btn--sm"
							onClick={() => void loadChanges()}
							disabled={loading || busy}
						>
							Refresh
						</button>
						<button
							type="button"
							className="btn btn--primary btn--sm"
							onClick={() => {
								setCommitError(null)
								setShowCommitSheet(true)
							}}
							disabled={files.length === 0 || busy}
						>
							Commit
							{stagedCount > 0 && ` (${stagedCount})`}
						</button>
					</div>
				</div>
			)}

			{error && (
				<div className="panel-alert panel-alert--error">
					<span>{error}</span>
					<button
						type="button"
						className="panel-alert__close"
						onClick={() => setError(null)}
						aria-label="Dismiss error"
					>
						×
					</button>
				</div>
			)}

			{message && (
				<div className="panel-alert panel-alert--success">
					<span>{message}</span>
					<button
						type="button"
						className="panel-alert__close"
						onClick={() => setMessage(null)}
						aria-label="Dismiss message"
					>
						×
					</button>
				</div>
			)}

			<div className="changes-layout" style={{ flex: 1, minHeight: 0 }}>
				{!isWide && selectedPath ? null : (
					<div className="changes-list-panel">
						<ChangesList
							files={files}
							selectedPath={selectedPath}
							onSelect={setSelectedPath}
							onStage={(path) => void handleStage(path)}
							onUnstage={(path) => void handleUnstage(path)}
							onStageAll={() => void handleStageAll()}
							onUnstageAll={() => void handleUnstageAll()}
							onDiscard={(path) => void handleDiscard(path)}
							busy={busy || loading}
						/>
					</div>
				)}
				{showDetail && <DiffView diff={diff} />}
			</div>

			<CommitSheet
				open={showCommitSheet}
				stagedCount={stagedCount}
				unstagedCount={unstagedCount}
				onClose={() => setShowCommitSheet(false)}
				onCommit={handleCommitSubmit}
				busy={busy}
				error={commitError}
			/>
		</div>
	)
}
