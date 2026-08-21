import { useCallback, useEffect, useState } from 'react'
import type { GitBranch, GitCommit, GitStatus } from '@shared/types/git'
import type { Project, RepoTab } from '@shared/types/project'
import { GitHubView } from '../components/github/GitHubView'
import { gitApi } from '../services/gitApi'
import '../styles/repo.css'

type RepoViewProps = {
	project: Project
}

export function RepoView({ project }: RepoViewProps) {
	const [tab, setTab] = useState<RepoTab>('git')
	const [status, setStatus] = useState<GitStatus | null>(null)
	const [branches, setBranches] = useState<GitBranch[]>([])
	const [commits, setCommits] = useState<GitCommit[]>([])
	const [message, setMessage] = useState('')
	const [busy, setBusy] = useState(false)

	const refreshGit = useCallback(async () => {
		setBusy(true)
		setMessage('')
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
			setMessage(err instanceof Error ? err.message : 'Failed to load repository data')
		} finally {
			setBusy(false)
		}
	}, [project.id])

	useEffect(() => {
		if (tab === 'git') void refreshGit()
	}, [tab, refreshGit])

	const run = async (label: string, fn: () => Promise<void>) => {
		setBusy(true)
		setMessage(label)
		try {
			await fn()
			setMessage(`${label} — done`)
			await refreshGit()
		} catch (err) {
			setMessage(err instanceof Error ? err.message : `${label} failed`)
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="workspace-pane repo-view">
			<div className="repo-tabs">
				<button type="button" className={`repo-tabs__btn${tab === 'git' ? ' is-active' : ''}`} onClick={() => setTab('git')}>
					Git
				</button>
				<button type="button" className={`repo-tabs__btn${tab === 'github' ? ' is-active' : ''}`} onClick={() => setTab('github')}>
					GitHub
				</button>
			</div>

			{tab === 'git' && message && <div className="panel-message">{message}</div>}

			{tab === 'git' && (
				<div className="repo-panel">
					<div className="repo-actions">
						<button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void run('Fetch', () => gitApi.fetch(project.id))}>Fetch</button>
						<button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void run('Pull', () => gitApi.pull(project.id))}>Pull</button>
						<button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void run('Push', () => gitApi.push(project.id))}>Push</button>
						<button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void refreshGit()}>Refresh</button>
					</div>

					{status && (
						<div className="repo-info">
							<div>Branch: <code>{status.branch || '—'}</code></div>
							<div>Ahead {status.ahead} · Behind {status.behind}</div>
							{status.hasConflicts && <div className="repo-warning">Merge conflicts detected</div>}
						</div>
					)}

					<section className="repo-section">
						<h3>Branches</h3>
						<ul className="repo-list">
							{branches.map((b) => (
								<li key={b.name} className="repo-list__item">
									<span>{b.name}{b.current ? ' (current)' : ''}</span>
									{!b.current && (
										<button type="button" className="btn btn--ghost btn--sm" onClick={() => void run(`Checkout ${b.name}`, () => gitApi.checkout(project.id, { name: b.name }))}>
											Checkout
										</button>
									)}
								</li>
							))}
						</ul>
						<button
							type="button"
							className="btn btn--ghost btn--sm"
							onClick={() => {
								const name = prompt('New branch name:')
								if (name) void run(`Create ${name}`, () => gitApi.checkout(project.id, { name, create: true }))
							}}
						>
							New branch
						</button>
					</section>

					<section className="repo-section">
						<h3>Recent commits</h3>
						<ul className="repo-list">
							{commits.map((c) => (
								<li key={c.hash} className="repo-list__item repo-list__item--stacked">
									<code>{c.shortHash}</code> {c.message}
									<span className="repo-list__meta">{c.author} · {new Date(c.date).toLocaleDateString()}</span>
								</li>
							))}
						</ul>
					</section>
				</div>
			)}

			{tab === 'github' && <GitHubView project={project} />}
		</div>
	)
}
