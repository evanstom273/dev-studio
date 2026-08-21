import { useCallback, useEffect, useState } from 'react'
import type { Project } from '@shared/types/project'
import type {
	GitHubAuthStatus,
	GitHubPullRequest,
	GitHubPullRequestDetail,
	GitHubPullRequestState,
	GitHubRepoDetails,
} from '@shared/types/github'
import { githubApi } from '../../services/githubApi'
import {
	Field,
	formatRelativeDate,
	GhInput,
	GhSelect,
	GhTextarea,
	GhToggle,
	prStateClass,
	Sheet,
	SheetActions,
} from './GitHubUi'
import { MarkdownRenderer } from '../MarkdownRenderer'

type GitHubViewProps = {
	project: Project
}

type SheetType = 'create-repo' | 'create-pr' | 'edit-repo' | 'merge-pr' | 'edit-pr' | null

const PR_FILTERS: { id: GitHubPullRequestState; label: string }[] = [
	{ id: 'open', label: 'Open' },
	{ id: 'merged', label: 'Merged' },
	{ id: 'closed', label: 'Closed' },
	{ id: 'all', label: 'All' },
]

export function GitHubView({ project }: GitHubViewProps) {
	const [auth, setAuth] = useState<GitHubAuthStatus | null>(null)
	const [repo, setRepo] = useState<GitHubRepoDetails | null>(null)
	const [prs, setPrs] = useState<GitHubPullRequest[]>([])
	const [prFilter, setPrFilter] = useState<GitHubPullRequestState>('open')
	const [selectedPr, setSelectedPr] = useState<GitHubPullRequestDetail | null>(null)
	const [sheet, setSheet] = useState<SheetType>(null)
	const [message, setMessage] = useState('')
	const [busy, setBusy] = useState(false)

	// Form state
	const [repoName, setRepoName] = useState(project.name.toLowerCase().replace(/\s+/g, '-'))
	const [repoDesc, setRepoDesc] = useState('')
	const [repoPrivate, setRepoPrivate] = useState(false)
	const [prTitle, setPrTitle] = useState('')
	const [prBody, setPrBody] = useState('')
	const [prBase, setPrBase] = useState('')
	const [prHead, setPrHead] = useState('')
	const [prDraft, setPrDraft] = useState(false)
	const [editDesc, setEditDesc] = useState('')
	const [editHomepage, setEditHomepage] = useState('')
	const [editPrivate, setEditPrivate] = useState(false)
	const [mergeMethod, setMergeMethod] = useState<'merge' | 'squash' | 'rebase'>('squash')
	const [deleteBranch, setDeleteBranch] = useState(true)
	const [editPrTitle, setEditPrTitle] = useState('')
	const [editPrBody, setEditPrBody] = useState('')

	const refresh = useCallback(async () => {
		setBusy(true)
		setMessage('')
		try {
			const [authStatus, repoData, prList] = await Promise.all([
				githubApi.authStatus(),
				githubApi.getRepo(project.id).catch(() => null),
				githubApi.listPullRequests(project.id, prFilter).catch(() => []),
			])
			setAuth(authStatus)
			setRepo(repoData)
			setPrs(prList)
			if (repoData) {
				setEditDesc(repoData.description)
				setEditHomepage(repoData.homepage)
				setEditPrivate(repoData.isPrivate)
				setPrBase(repoData.defaultBranch)
			}
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Failed to load GitHub data')
		} finally {
			setBusy(false)
		}
	}, [project.id, prFilter])

	useEffect(() => {
		void refresh()
	}, [refresh])

	const openPr = async (number: number) => {
		setBusy(true)
		try {
			const detail = await githubApi.getPullRequest(project.id, number)
			setSelectedPr(detail)
			setEditPrTitle(detail.title)
			setEditPrBody(detail.body)
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Failed to load PR')
		} finally {
			setBusy(false)
		}
	}

	const run = async (label: string, fn: () => Promise<void>) => {
		setBusy(true)
		setMessage(label)
		try {
			await fn()
			setMessage(`${label} — done`)
			setSheet(null)
			setSelectedPr(null)
			await refresh()
		} catch (err) {
			setMessage(err instanceof Error ? err.message : `${label} failed`)
		} finally {
			setBusy(false)
		}
	}

	if (!auth?.authenticated) {
		return (
			<div className="gh-panel">
				<div className="gh-empty">
					<p className="gh-empty__title">GitHub not connected</p>
					<p className="gh-empty__desc">Add your GitHub token in Settings, then refresh.</p>
					<button type="button" className="btn btn--ghost btn--sm" onClick={() => void refresh()} disabled={busy}>
						Refresh
					</button>
				</div>
			</div>
		)
	}

	return (
		<div className="gh-panel">
			{message && <div className="panel-message">{message}</div>}

			{/* Auth + actions bar */}
			<div className="gh-toolbar">
				<span className="gh-toolbar__user">@{auth.username}</span>
				<div className="gh-toolbar__actions">
					{!repo && (
						<button type="button" className="btn btn--primary btn--sm" onClick={() => setSheet('create-repo')}>
							Create repo
						</button>
					)}
					{repo && (
						<>
							<button type="button" className="btn btn--ghost btn--sm" onClick={() => setSheet('create-pr')}>
								New PR
							</button>
							<button type="button" className="btn btn--ghost btn--sm" onClick={() => setSheet('edit-repo')}>
								Settings
							</button>
						</>
					)}
					<button type="button" className="btn btn--ghost btn--sm" onClick={() => void refresh()} disabled={busy}>
						Refresh
					</button>
				</div>
			</div>

			{/* Repo overview */}
			{repo ? (
				<section className="gh-section">
					<div className="gh-repo-card">
						<div className="gh-repo-card__header">
							<h3 className="gh-repo-card__name">{repo.fullName}</h3>
							<span className={`gh-badge ${repo.isPrivate ? 'gh-badge--private' : 'gh-badge--public'}`}>
								{repo.visibility}
							</span>
						</div>
						{repo.description && <p className="gh-repo-card__desc">{repo.description}</p>}
						<div className="gh-repo-card__stats">
							<span>★ {repo.starCount}</span>
							<span>⑂ {repo.forkCount}</span>
							<span>Issues {repo.openIssueCount}</span>
							<span>Default: <code>{repo.defaultBranch}</code></span>
						</div>
						<div className="gh-repo-card__meta">
							Updated {formatRelativeDate(repo.updatedAt)} · Pushed {formatRelativeDate(repo.pushedAt)}
						</div>
						<a href={repo.url} target="_blank" rel="noopener noreferrer" className="gh-link">
							Open on GitHub ↗
						</a>
					</div>
				</section>
			) : (
				<section className="gh-section">
					<div className="gh-empty gh-empty--compact">
						<p>No GitHub repository linked to this project.</p>
						<p className="gh-empty__desc">Create a new repo or push an existing one from your laptop.</p>
					</div>
				</section>
			)}

			{/* Pull requests */}
			{repo && (
				<section className="gh-section">
					<div className="gh-section__header">
						<h3 className="gh-section__title">Pull requests</h3>
						<div className="gh-filter-tabs">
							{PR_FILTERS.map((f) => (
								<button
									key={f.id}
									type="button"
									className={`gh-filter-tabs__btn${prFilter === f.id ? ' is-active' : ''}`}
									onClick={() => setPrFilter(f.id)}
								>
									{f.label}
								</button>
							))}
						</div>
					</div>

					{selectedPr ? (
						<div className="gh-pr-detail">
							<button type="button" className="gh-back" onClick={() => setSelectedPr(null)}>← Pull requests</button>
							<div className="gh-pr-detail__header">
								<span className={`gh-badge ${prStateClass(selectedPr.state)}`}>{selectedPr.state}</span>
								{selectedPr.isDraft && <span className="gh-badge gh-badge--draft">draft</span>}
								<h4 className="gh-pr-detail__title">#{selectedPr.number} {selectedPr.title}</h4>
							</div>
							<div className="gh-pr-detail__meta">
								<span>{selectedPr.author}</span>
								<span>{selectedPr.headBranch} → {selectedPr.baseBranch}</span>
								{selectedPr.changedFiles !== undefined && (
									<span>{selectedPr.changedFiles} files · +{selectedPr.additions ?? 0} −{selectedPr.deletions ?? 0}</span>
								)}
								{selectedPr.checksStatus && selectedPr.checksStatus !== 'none' && (
									<span className={`gh-checks gh-checks--${selectedPr.checksStatus}`}>Checks: {selectedPr.checksStatus}</span>
								)}
							</div>
							{selectedPr.labels && selectedPr.labels.length > 0 && (
								<div className="gh-labels">
									{selectedPr.labels.map((l) => <span key={l} className="gh-label">{l}</span>)}
								</div>
							)}
							{selectedPr.body && (
								<div className="gh-pr-detail__body">
									<MarkdownRenderer content={selectedPr.body} />
								</div>
							)}
							{selectedPr.reviews.length > 0 && (
								<div className="gh-reviews">
									<h5>Reviews</h5>
									{selectedPr.reviews.map((r, i) => (
										<div key={i} className="gh-review">
											<strong>{r.author}</strong> — {r.state}
										</div>
									))}
								</div>
							)}
							<div className="gh-pr-detail__actions">
								<a href={selectedPr.url} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
									View on GitHub
								</a>
								{selectedPr.state === 'open' && (
									<>
										<button type="button" className="btn btn--ghost btn--sm" onClick={() => setSheet('edit-pr')}>
											Edit
										</button>
										<button type="button" className="btn btn--ghost btn--sm" onClick={() => void run('Close PR', () => githubApi.closePullRequest(project.id, { number: selectedPr.number }))}>
											Close
										</button>
										{selectedPr.mergeable !== false && (
											<button type="button" className="btn btn--primary btn--sm" onClick={() => setSheet('merge-pr')}>
												Merge
											</button>
										)}
									</>
								)}
								{selectedPr.state === 'closed' && (
									<button type="button" className="btn btn--ghost btn--sm" onClick={() => void run('Reopen PR', () => githubApi.reopenPullRequest(project.id, selectedPr.number))}>
										Reopen
									</button>
								)}
							</div>
						</div>
					) : (
						<ul className="gh-pr-list">
							{prs.length === 0 && (
								<li className="gh-pr-list__empty">No {prFilter === 'all' ? '' : prFilter} pull requests</li>
							)}
							{prs.map((pr) => (
								<li key={pr.number}>
									<button type="button" className="gh-pr-list__item" onClick={() => void openPr(pr.number)}>
										<div className="gh-pr-list__top">
											<span className={`gh-badge ${prStateClass(pr.state)}`}>{pr.state}</span>
											{pr.isDraft && <span className="gh-badge gh-badge--draft">draft</span>}
											<span className="gh-pr-list__title">#{pr.number} {pr.title}</span>
										</div>
										<div className="gh-pr-list__meta">
											{pr.author} · {pr.headBranch} → {pr.baseBranch} · {formatRelativeDate(pr.createdAt)}
											{pr.changedFiles !== undefined && ` · ${pr.changedFiles} files`}
										</div>
									</button>
								</li>
							))}
						</ul>
					)}
				</section>
			)}

			{/* Danger zone */}
			{repo && (
				<section className="gh-section gh-section--danger">
					<h3 className="gh-section__title">Danger zone</h3>
					<p className="gh-danger__desc">Permanently delete this repository from GitHub. Local files are not removed.</p>
					<button
						type="button"
						className="btn btn--danger btn--sm"
						onClick={() => {
							const expected = repo.fullName
							const confirmation = prompt(`Type "${expected}" to delete this GitHub repository:`)
							if (confirmation) {
								void run('Delete repository', () => githubApi.deleteRepo(project.id, { confirmation }))
							}
						}}
					>
						Delete repository
					</button>
				</section>
			)}

			{/* Sheets */}
			<Sheet open={sheet === 'create-repo'} title="Create GitHub repository" onClose={() => setSheet(null)}>
				<Field label="Repository name">
					<GhInput value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder="my-project" />
				</Field>
				<Field label="Description">
					<GhTextarea value={repoDesc} onChange={(e) => setRepoDesc(e.target.value)} rows={3} placeholder="Optional description" />
				</Field>
				<GhToggle checked={repoPrivate} onChange={setRepoPrivate} label="Private repository" />
				<SheetActions>
					<button type="button" className="btn btn--ghost" onClick={() => setSheet(null)}>Cancel</button>
					<button
						type="button"
						className="btn btn--primary"
						disabled={!repoName.trim() || busy}
						onClick={() => void run('Create repository', async () => { await githubApi.createRepo(project.id, { name: repoName.trim(), description: repoDesc.trim() || undefined, private: repoPrivate }) })}
					>
						Create & push
					</button>
				</SheetActions>
			</Sheet>

			<Sheet open={sheet === 'create-pr'} title="Create pull request" onClose={() => setSheet(null)}>
				<Field label="Title">
					<GhInput value={prTitle} onChange={(e) => setPrTitle(e.target.value)} placeholder="PR title" />
				</Field>
				<Field label="Description">
					<GhTextarea value={prBody} onChange={(e) => setPrBody(e.target.value)} rows={5} placeholder="Describe your changes..." />
				</Field>
				<Field label="Base branch" hint="Branch to merge into">
					<GhInput value={prBase} onChange={(e) => setPrBase(e.target.value)} placeholder="main" />
				</Field>
				<Field label="Head branch" hint="Branch with your changes (defaults to current)">
					<GhInput value={prHead} onChange={(e) => setPrHead(e.target.value)} placeholder="feature/my-change" />
				</Field>
				<GhToggle checked={prDraft} onChange={setPrDraft} label="Create as draft" />
				<SheetActions>
					<button type="button" className="btn btn--ghost" onClick={() => setSheet(null)}>Cancel</button>
					<button
						type="button"
						className="btn btn--primary"
						disabled={!prTitle.trim() || busy}
						onClick={() => void run('Create PR', async () => { await githubApi.createPullRequest(project.id, {
							title: prTitle.trim(),
							body: prBody.trim() || undefined,
							base: prBase.trim() || undefined,
							head: prHead.trim() || undefined,
							draft: prDraft,
						}) })}
					>
						Create PR
					</button>
				</SheetActions>
			</Sheet>

			<Sheet open={sheet === 'edit-repo'} title="Repository settings" onClose={() => setSheet(null)}>
				<Field label="Description">
					<GhTextarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} />
				</Field>
				<Field label="Homepage URL">
					<GhInput value={editHomepage} onChange={(e) => setEditHomepage(e.target.value)} placeholder="https://..." />
				</Field>
				<GhToggle checked={editPrivate} onChange={setEditPrivate} label="Private repository" />
				<SheetActions>
					<button type="button" className="btn btn--ghost" onClick={() => setSheet(null)}>Cancel</button>
					<button
						type="button"
						className="btn btn--primary"
						disabled={busy}
						onClick={() => void run('Update repository', () => githubApi.updateRepo(project.id, {
							description: editDesc,
							homepage: editHomepage,
							private: editPrivate,
						}))}
					>
						Save
					</button>
				</SheetActions>
			</Sheet>

			<Sheet open={sheet === 'edit-pr'} title={`Edit PR #${selectedPr?.number ?? ''}`} onClose={() => setSheet(null)}>
				<Field label="Title">
					<GhInput value={editPrTitle} onChange={(e) => setEditPrTitle(e.target.value)} />
				</Field>
				<Field label="Description">
					<GhTextarea value={editPrBody} onChange={(e) => setEditPrBody(e.target.value)} rows={6} />
				</Field>
				<SheetActions>
					<button type="button" className="btn btn--ghost" onClick={() => setSheet(null)}>Cancel</button>
					<button
						type="button"
						className="btn btn--primary"
						disabled={!editPrTitle.trim() || !selectedPr || busy}
						onClick={() => selectedPr && void run('Update PR', () => githubApi.updatePullRequest(project.id, selectedPr.number, {
							title: editPrTitle.trim(),
							body: editPrBody,
						}))}
					>
						Save
					</button>
				</SheetActions>
			</Sheet>

			<Sheet open={sheet === 'merge-pr'} title={`Merge PR #${selectedPr?.number ?? ''}`} onClose={() => setSheet(null)}>
				<p className="gh-merge__desc">{selectedPr?.title}</p>
				<Field label="Merge method">
					<GhSelect value={mergeMethod} onChange={(e) => setMergeMethod(e.target.value as typeof mergeMethod)}>
						<option value="squash">Squash and merge</option>
						<option value="merge">Create merge commit</option>
						<option value="rebase">Rebase and merge</option>
					</GhSelect>
				</Field>
				<GhToggle checked={deleteBranch} onChange={setDeleteBranch} label="Delete head branch after merge" />
				<SheetActions>
					<button type="button" className="btn btn--ghost" onClick={() => setSheet(null)}>Cancel</button>
					<button
						type="button"
						className="btn btn--primary"
						disabled={!selectedPr || busy}
						onClick={() => selectedPr && void run(`Merge PR #${selectedPr.number}`, () => githubApi.mergePullRequest(project.id, {
							number: selectedPr.number,
							method: mergeMethod,
							deleteBranch,
						}))}
					>
						Merge
					</button>
				</SheetActions>
			</Sheet>
		</div>
	)
}
