import { useCallback, useEffect, useState } from 'react'
import type { GitBranch, GitCommit, GitStatus } from '@shared/types/git'
import type { Project, RepoTab } from '@shared/types/project'
import { Field, GhInput, GhToggle, Sheet, SheetActions } from '../components/github/GitHubUi'
import { GitHubView } from '../components/github/GitHubView'
import { gitApi, projectsApi } from '../services/gitApi'
import '../styles/repo.css'

type RepoViewProps = {
	project: Project
}

function NewBranchSheet({
	open,
	onClose,
	onCreate,
	busy,
	error,
}: {
	open: boolean
	onClose: () => void
	onCreate: (name: string, checkout: boolean) => Promise<void>
	busy?: boolean
	error?: string | null
}) {
	const [name, setName] = useState('')
	const [checkout, setCheckout] = useState(true)

	const handleSubmit = () => {
		const trimmed = name.trim()
		if (!trimmed || busy) return
		void onCreate(trimmed, checkout).then(() => {
			setName('')
		})
	}

	return (
		<Sheet open={open} title="Create New Branch" onClose={onClose}>
			{error && <div className="panel-alert panel-alert--error">{error}</div>}

			<Field label="Branch name" hint="e.g. feature/my-feature or fix/bug-123">
				<GhInput
					value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault()
							handleSubmit()
						}
					}}
					placeholder="branch-name"
					autoFocus
				/>
			</Field>

			<GhToggle
				checked={checkout}
				onChange={setCheckout}
				label="Switch to new branch after creation"
			/>

			<SheetActions>
				<button
					type="button"
					className="btn btn--ghost"
					onClick={onClose}
					disabled={busy}
				>
					Cancel
				</button>
				<button
					type="button"
					className="btn btn--primary"
					disabled={!name.trim() || busy}
					onClick={handleSubmit}
				>
					{busy ? 'Creating…' : 'Create Branch'}
				</button>
			</SheetActions>
		</Sheet>
	)
}

export function RepoView({ project }: RepoViewProps) {
	const [tab, setTab] = useState<RepoTab>('git')
	const [status, setStatus] = useState<GitStatus | null>(null)
	const [branches, setBranches] = useState<GitBranch[]>([])
	const [commits, setCommits] = useState<GitCommit[]>([])
	const [message, setMessage] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [showBranchSheet, setShowBranchSheet] = useState(false)
	const [branchError, setBranchError] = useState<string | null>(null)

	const refreshGit = useCallback(async () => {
		setBusy(true)
		try {
			const [gitStatus, branchList, log] = await Promise.all([
				gitApi.status(project.id),
				gitApi.branches(project.id),
				gitApi.log(project.id),
			])
			setStatus(gitStatus)
			setBranches(branchList)
			setCommits(log)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load repository data')
		} finally {
			setBusy(false)
		}
	}, [project.id])

	useEffect(() => {
		if (tab === 'git') void refreshGit()
	}, [tab, refreshGit])

	const clearAlerts = () => {
		setError(null)
		setMessage(null)
	}

	const run = async (label: string, fn: () => Promise<void>) => {
		clearAlerts()
		setBusy(true)
		setMessage(`${label} in progress…`)
		try {
			await fn()
			setMessage(`${label} — completed successfully`)
			await refreshGit()
		} catch (err) {
			const errText = err instanceof Error ? err.message : `${label} failed`
			setError(errText)
			setMessage(null)
		} finally {
			setBusy(false)
		}
	}

	const handleCreateBranch = async (name: string, createAndCheckout: boolean) => {
		setBranchError(null)
		setBusy(true)
		try {
			await gitApi.checkout(project.id, { name, create: true })
			setShowBranchSheet(false)
			setMessage(
				createAndCheckout
					? `Created and switched to branch "${name}"`
					: `Created branch "${name}"`,
			)
			await refreshGit()
		} catch (err) {
			const errText = err instanceof Error ? err.message : 'Failed to create branch'
			setBranchError(errText)
			setError(errText)
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="workspace-pane repo-view">
			<div className="repo-tabs">
				<button
					type="button"
					className={`repo-tabs__btn${tab === 'git' ? ' is-active' : ''}`}
					onClick={() => setTab('git')}
				>
					Git
				</button>
				<button
					type="button"
					className={`repo-tabs__btn${tab === 'github' ? ' is-active' : ''}`}
					onClick={() => setTab('github')}
				>
					GitHub
				</button>
			</div>

			{tab === 'git' && error && (
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

			{tab === 'git' && message && (
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

			{tab === 'git' && (
				!project.isGitRepo ? (
					<div className="repo-panel">
						<div className="hub-empty" style={{ margin: 'var(--space-md) 0' }}>
							<p className="hub-empty__title">Not a Git repository</p>
							<p className="hub-empty__desc">
								This workspace ({project.path}) is a local directory not tracked with Git. Initialize Git to enable version control and branch management.
							</p>
							<button
								type="button"
								className="btn btn--primary"
								disabled={busy}
								onClick={() =>
									void run('Initialize Git repository', async () => {
										await projectsApi.init({ path: project.path })
										project.isGitRepo = true
									})
								}
							>
								{busy ? 'Initializing…' : 'Initialize Git repository'}
							</button>
						</div>
					</div>
				) : (
					<div className="repo-panel">
						<div className="repo-actions">
						<button
							type="button"
							className="btn btn--ghost btn--sm"
							disabled={busy}
							onClick={() => void run('Fetch', () => gitApi.fetch(project.id))}
						>
							Fetch
						</button>
						<button
							type="button"
							className="btn btn--ghost btn--sm"
							disabled={busy}
							onClick={() => void run('Pull', () => gitApi.pull(project.id))}
						>
							Pull
						</button>
						<button
							type="button"
							className="btn btn--ghost btn--sm"
							disabled={busy}
							onClick={() => void run('Push', () => gitApi.push(project.id))}
						>
							Push
						</button>
						<button
							type="button"
							className="btn btn--ghost btn--sm"
							disabled={busy}
							onClick={() => {
								clearAlerts()
								void refreshGit()
							}}
						>
							Refresh
						</button>
					</div>

					{status && (
						<div className="repo-info">
							<div>
								Branch: <code>{status.branch || '—'}</code>
							</div>
							<div>
								Ahead {status.ahead} · Behind {status.behind}
							</div>
							{status.hasConflicts && (
								<div className="repo-warning">Merge conflicts detected</div>
							)}
						</div>
					)}

					<section className="repo-section">
						<div className="repo-section__header">
							<h3>Branches ({branches.length})</h3>
							<button
								type="button"
								className="btn btn--ghost btn--xs"
								onClick={() => {
									setBranchError(null)
									setShowBranchSheet(true)
								}}
								disabled={busy}
							>
								+ New branch
							</button>
						</div>
						<ul className="repo-list">
							{branches.map((b) => (
								<li key={b.name} className="repo-list__item">
									<span>
										{b.name}
										{b.current ? ' (current)' : ''}
									</span>
									{!b.current && (
										<button
											type="button"
											className="btn btn--ghost btn--xs"
											disabled={busy}
											onClick={() =>
												void run(`Checkout ${b.name}`, () =>
													gitApi.checkout(project.id, { name: b.name }),
												)
											}
										>
											Checkout
										</button>
									)}
								</li>
							))}
						</ul>
					</section>

					<section className="repo-section">
						<h3>Recent commits ({commits.length})</h3>
						<ul className="repo-list">
							{commits.map((c) => (
								<li key={c.hash} className="repo-list__item repo-list__item--stacked">
									<code>{c.shortHash}</code> {c.message}
									<span className="repo-list__meta">
										{c.author} · {new Date(c.date).toLocaleDateString()}
									</span>
								</li>
							))}
						</ul>
					</section>
				</div>
				)
			)}

			{tab === 'github' && <GitHubView project={project} />}

			<NewBranchSheet
				open={showBranchSheet}
				onClose={() => setShowBranchSheet(false)}
				onCreate={handleCreateBranch}
				busy={busy}
				error={branchError}
			/>
		</div>
	)
}
