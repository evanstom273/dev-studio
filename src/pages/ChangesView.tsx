import { useCallback, useEffect, useState } from 'react'
import type { ChangedFile, FileDiff } from '@shared/types/git'
import type { GitHubPullRequest } from '@shared/types/github'
import type { Project } from '@shared/types/project'
import { ChangesList, CommitPrSheet, DiffView, PrMergeSheet } from '../components/ChangesPanel'
import { IconBack } from '../components/Icons'
import { useWideLayout } from '../hooks/useMediaQuery'
import { agentApi } from '../services/agentApi'
import { gitApi } from '../services/gitApi'
import { githubApi } from '../services/githubApi'
import '../styles/panels.css'

type ChangesViewProps = {
	project: Project
}

export function ChangesView({ project }: ChangesViewProps) {
	const [files, setFiles] = useState<ChangedFile[]>([])
	const [selectedPath, setSelectedPath] = useState<string | null>(null)
	const [diff, setDiff] = useState<FileDiff | null>(null)
	const [currentBranch, setCurrentBranch] = useState<string>('main')
	const [hasGitHub, setHasGitHub] = useState<boolean>(false)
	const [loading, setLoading] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [message, setMessage] = useState<string | null>(null)
	const [showCommitSheet, setShowCommitSheet] = useState(false)
	const [commitError, setCommitError] = useState<string | null>(null)
	const [createdPr, setCreatedPr] = useState<GitHubPullRequest | null>(null)
	const [showMergeSheet, setShowMergeSheet] = useState(false)
	const [mergeError, setMergeError] = useState<string | null>(null)
	const isWide = useWideLayout()

	const loadChanges = useCallback(async () => {
		setLoading(true)
		try {
			const [status, repoDetails] = await Promise.all([
				gitApi.status(project.id).catch(() => null),
				githubApi.getRepo(project.id).catch(() => null),
			])
			if (status) {
				setFiles(status.changed)
				setCurrentBranch(status.branch || 'main')
			} else {
				const changed = await agentApi.listChanges(project.id)
				setFiles(changed)
			}
			setHasGitHub(Boolean(repoDetails))
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

	const handleCommitSubmit = async (data: {
		message: string
		description?: string
		branch?: string
	}) => {
		setCommitError(null)
		setBusy(true)
		try {
			const result = await githubApi.commitAndOpenPr(project.id, {
				message: data.message,
				description: data.description,
				branch: data.branch,
			})
			setShowCommitSheet(false)
			await loadChanges()

			if (result.pr) {
				setCreatedPr(result.pr)
				setShowMergeSheet(true)
				setMessage(`Created PR #${result.pr.number}: ${result.pr.title}`)
			} else {
				setMessage(`Committed ${result.hash.slice(0, 7)}: ${data.message}`)
			}
		} catch (err) {
			const errText = err instanceof Error ? err.message : 'Commit failed'
			setCommitError(errText)
			setError(errText)
		} finally {
			setBusy(false)
		}
	}

	const handleMergeSubmit = async (
		method: 'squash' | 'merge' | 'rebase',
		deleteBranch: boolean,
	) => {
		if (!createdPr) return
		setMergeError(null)
		setBusy(true)
		try {
			const res = await githubApi.mergeAndSync(project.id, {
				number: createdPr.number,
				method,
				deleteBranch,
			})
			setShowMergeSheet(false)
			const mergedPrNumber = createdPr.number
			setCreatedPr(null)
			setMessage(`✓ PR #${mergedPrNumber} merged into ${res.currentBranch} and synced locally!`)
			await loadChanges()
		} catch (err) {
			const errText = err instanceof Error ? err.message : 'Merge failed'
			setMergeError(errText)
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
					<h2 className="panel-header__title">
						Changes {files.length > 0 && `(${files.length})`}
					</h2>
					<div className="panel-header__buttons">
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
							{hasGitHub ? 'Commit & Open PR' : 'Commit'}
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
							onDiscard={(path) => void handleDiscard(path)}
							busy={busy || loading}
						/>
					</div>
				)}
				{showDetail && <DiffView diff={diff} />}
			</div>

			<CommitPrSheet
				open={showCommitSheet}
				fileCount={files.length}
				currentBranch={currentBranch}
				hasGitHub={hasGitHub}
				onClose={() => setShowCommitSheet(false)}
				onCommit={handleCommitSubmit}
				busy={busy}
				error={commitError}
			/>

			<PrMergeSheet
				open={showMergeSheet}
				pr={createdPr}
				onClose={() => setShowMergeSheet(false)}
				onMerge={handleMergeSubmit}
				busy={busy}
				error={mergeError}
			/>
		</div>
	)
}

