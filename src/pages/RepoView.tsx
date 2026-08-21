import { useCallback, useEffect, useState } from 'react'
import type { GitBranch, GitCommit, GitStatus } from '@shared/types/git'
import type { GitHubAuthStatus, GitHubPullRequest, GitHubRepoInfo } from '@shared/types/github'
import type { Project, RepoTab } from '@shared/types/project'
import { gitApi } from '../services/gitApi'
import { githubApi } from '../services/githubApi'
import '../styles/repo.css'

type RepoViewProps = {
	project: Project
}

export function RepoView({ project }: RepoViewProps) {
	const [tab, setTab] = useState<RepoTab>('git')
	const [status, setStatus] = useState<GitStatus | null>(null)
	const [branches, setBranches] = useState<GitBranch[]>([])
	const [commits, setCommits] = useState<GitCommit[]>([])
	const [ghAuth, setGhAuth] = useState<GitHubAuthStatus | null>(null)
	const [repoInfo, setRepoInfo] = useState<GitHubRepoInfo | null>(null)
	const [prs, setPrs] = useState<GitHubPullRequest[]>([])
	const [message, setMessage] = useState('')
	const [busy, setBusy] = useState(false)

	const refresh = useCallback(async () => {
		setBusy(true)
		setMessage('')
		try {
			const [gitStatus, branchList, log, auth, repo, pullRequests] = await Promise.all([
				gitApi.status(project.id),
				gitApi.branches(project.id),
				gitApi.log(project.id),
				githubApi.authStatus(),
				githubApi.getRepo(project.id).catch(() => null),
				githubApi.listPullRequests(project.id).catch(() => []),
			])
			setStatus(gitStatus)
			setBranches(branchList)
			setCommits(log)
			setGhAuth(auth)
			setRepoInfo(repo)
			setPrs(pullRequests)
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Failed to load repository data')
		} finally {
			setBusy(false)
		}
	}, [project.id])

	useEffect(() => {
		void refresh()
	}, [refresh])

	const run = async (label: string, fn: () => Promise<void>) => {
		setBusy(true)
		setMessage(label)
		try {
			await fn()
			setMessage(`${label} — done`)
			await refresh()
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

			{message && <div className="panel-message">{message}</div>}

			{tab === 'git' && (
				<div className="repo-panel">
					<div className="repo-actions">
						<button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void run('Fetch', () => gitApi.fetch(project.id))}>Fetch</button>
						<button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void run('Pull', () => gitApi.pull(project.id))}>Pull</button>
						<button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void run('Push', () => gitApi.push(project.id))}>Push</button>
						<button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void refresh()}>Refresh</button>
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

			{tab === 'github' && (
				<div className="repo-panel">
					<div className="repo-info">
						{ghAuth?.authenticated ? (
							<div>Signed in as <strong>{ghAuth.username}</strong></div>
						) : (
							<div className="repo-warning">{ghAuth?.message ?? 'GitHub CLI not authenticated on laptop'}</div>
						)}
						{repoInfo && <div>Repository: <code>{repoInfo.owner}/{repoInfo.repo}</code></div>}
					</div>

					<div className="repo-actions">
						<button
							type="button"
							className="btn btn--ghost btn--sm"
							disabled={busy}
							onClick={() => {
								const name = prompt('Repository name:', project.name.toLowerCase().replace(/\s+/g, '-'))
								if (name) void run('Create GitHub repo', () => githubApi.createRepo(project.id, { name }).then(() => undefined))
							}}
						>
							Create repo
						</button>
						<button
							type="button"
							className="btn btn--ghost btn--sm"
							disabled={busy}
							onClick={() => {
								const title = prompt('PR title:')
								if (title) void run('Create PR', () => githubApi.createPullRequest(project.id, { title }).then(() => undefined))
							}}
						>
							Create PR
						</button>
					</div>

					<section className="repo-section">
						<h3>Pull requests</h3>
						<ul className="repo-list">
							{prs.map((pr) => (
								<li key={pr.number} className="repo-list__item">
									<div>
										<strong>#{pr.number}</strong> {pr.title}
										<div className="repo-list__meta">{pr.state} · {pr.headBranch} → {pr.baseBranch}</div>
									</div>
									{pr.state === 'open' && (
										<button type="button" className="btn btn--primary btn--sm" onClick={() => void run(`Merge #${pr.number}`, () => githubApi.mergePullRequest(project.id, { number: pr.number }))}>
											Merge
										</button>
									)}
								</li>
							))}
							{prs.length === 0 && <li className="repo-list__empty">No pull requests</li>}
						</ul>
					</section>

					{repoInfo && (
						<section className="repo-section repo-section--danger">
							<h3>Danger zone</h3>
							<button
								type="button"
								className="btn btn--danger btn--sm"
								onClick={() => {
									const expected = `${repoInfo.owner}/${repoInfo.repo}`
									const confirmation = prompt(`Type "${expected}" to delete this GitHub repository:`)
									if (confirmation) {
										void run('Delete repo', () => githubApi.deleteRepo(project.id, { confirmation }).then(() => undefined))
									}
								}}
							>
								Delete GitHub repository
							</button>
						</section>
					)}
				</div>
			)}
		</div>
	)
}
