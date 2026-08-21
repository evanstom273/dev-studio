import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GitHubRepoSummary } from '@shared/types/github'
import type { Project } from '@shared/types/project'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { ProjectList } from '../components/ProjectList'
import { ConnectSheet, CreateRepoSheet } from '../components/projects/ProjectHubSheets'
import { useConnection } from '../hooks/useConnection'
import { agentApi } from '../services/agentApi'
import { projectsApi } from '../services/gitApi'
import { githubApi } from '../services/githubApi'
import '../styles/projects.css'
import '../styles/github.css'

type ProjectsPageProps = {
	onSelectProject: (project: Project) => void
	onOpenSettings: () => void
}

type HubTab = 'recent' | 'github'

export function ProjectsPage({ onSelectProject, onOpenSettings }: ProjectsPageProps) {
	const { state, config } = useConnection()
	const [tab, setTab] = useState<HubTab>('github')
	const [projects, setProjects] = useState<Project[]>([])
	const [githubRepos, setGithubRepos] = useState<GitHubRepoSummary[]>([])
	const [search, setSearch] = useState('')
	const [loading, setLoading] = useState(false)
	const [opening, setOpening] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [connectOpen, setConnectOpen] = useState(false)
	const [createOpen, setCreateOpen] = useState(false)

	const connected = state.status === 'connected'
	const hasGithub = Boolean(config.githubToken)

	const loadRecent = useCallback(async () => {
		if (!connected) {
			setProjects([])
			return
		}
		setLoading(true)
		setError(null)
		try {
			setProjects(await agentApi.listProjects())
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load projects')
		} finally {
			setLoading(false)
		}
	}, [connected])

	const loadGithub = useCallback(async () => {
		if (!connected || !hasGithub) {
			setGithubRepos([])
			return
		}
		setLoading(true)
		setError(null)
		try {
			setGithubRepos(await githubApi.listUserRepos())
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load GitHub repos')
		} finally {
			setLoading(false)
		}
	}, [connected, hasGithub])

	useEffect(() => {
		if (tab === 'recent') void loadRecent()
		else void loadGithub()
	}, [tab, loadRecent, loadGithub])

	useEffect(() => {
		if (!connected && !config.backendUrl) {
			setConnectOpen(true)
		}
	}, [connected, config.backendUrl])

	const filteredRepos = useMemo(() => {
		const q = search.trim().toLowerCase()
		if (!q) return githubRepos
		return githubRepos.filter(
			(repo) =>
				repo.fullName.toLowerCase().includes(q) ||
				repo.description.toLowerCase().includes(q),
		)
	}, [githubRepos, search])

	const handleOpenGithub = async (repo: GitHubRepoSummary) => {
		const [owner, name] = repo.fullName.split('/')
		if (!owner || !name) return
		setOpening(repo.fullName)
		setError(null)
		try {
			const project = await projectsApi.openFromGitHub({ owner, repo: name })
			onSelectProject(project)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to open repository')
		} finally {
			setOpening(null)
		}
	}

	const handleRemoveLocal = async (project: Project) => {
		if (!confirm(`Remove local workspace for ${project.githubFullName ?? project.name}? GitHub is unchanged.`)) {
			return
		}
		try {
			await projectsApi.removeLocalCopy(project.id)
			await loadRecent()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Remove failed')
		}
	}

	return (
		<main className="projects-page">
			<header className="projects-page__header">
				<div className="projects-page__top">
					<div>
						<h1 className="projects-page__title">Dev Studio</h1>
						<p className="projects-page__subtitle">
							{connected ? 'Pick a repository or start a chat' : 'Connect your laptop to begin'}
						</p>
					</div>
					<div className="projects-page__header-actions">
						{connected ? (
							<span className="hub-status hub-status--ok">Connected</span>
						) : (
							<button type="button" className="btn btn--primary btn--sm" onClick={() => setConnectOpen(true)}>
								Connect
							</button>
						)}
						<button type="button" className="btn btn--ghost btn--sm" onClick={onOpenSettings}>
							Settings
						</button>
					</div>
				</div>
			</header>

			<ConnectionBanner />

			{connected && (
				<div className="hub-actions">
					<button type="button" className="btn btn--primary btn--sm" onClick={() => setCreateOpen(true)}>
						+ New repository
					</button>
				</div>
			)}

			<div className="hub-tabs">
				<button
					type="button"
					className={`hub-tabs__btn${tab === 'github' ? ' is-active' : ''}`}
					onClick={() => setTab('github')}
				>
					GitHub
				</button>
				<button
					type="button"
					className={`hub-tabs__btn${tab === 'recent' ? ' is-active' : ''}`}
					onClick={() => setTab('recent')}
				>
					Recent Workspaces
				</button>
			</div>

			{tab === 'github' && connected && hasGithub && (
				<input
					className="hub-search"
					type="search"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search repositories…"
				/>
			)}

			{error && <div className="panel-message">{error}</div>}

			{!connected && (
				<div className="hub-empty">
					<p className="hub-empty__title">Connect your laptop</p>
					<p className="hub-empty__desc">
						One-time setup: your Tailscale address + GitHub token. After that, pick any repository.
					</p>
					<button type="button" className="btn btn--primary" onClick={() => setConnectOpen(true)}>
						Connect now
					</button>
				</div>
			)}

			{connected && tab === 'github' && !hasGithub && (
				<div className="hub-empty">
					<p className="hub-empty__title">GitHub token needed</p>
					<p className="hub-empty__desc">Add your PAT in Settings to browse and open repositories.</p>
					<button type="button" className="btn btn--primary" onClick={() => setConnectOpen(true)}>
						Add token
					</button>
				</div>
			)}

			{connected && tab === 'github' && hasGithub && (
				<ul className="hub-repo-list">
					{loading && <li className="hub-repo-list__hint">Loading repositories…</li>}
					{!loading && filteredRepos.length === 0 && (
						<li className="hub-repo-list__hint">No repositories found</li>
					)}
					{filteredRepos.map((repo) => (
						<li key={repo.id}>
							<button
								type="button"
								className="hub-repo-item"
								disabled={opening === repo.fullName}
								onClick={() => void handleOpenGithub(repo)}
							>
								<div className="hub-repo-item__top">
									<span className="hub-repo-item__name">{repo.fullName}</span>
									<span className={`hub-badge${repo.private ? ' hub-badge--private' : ''}`}>
										{repo.private ? 'private' : 'public'}
									</span>
								</div>
								{repo.description && (
									<p className="hub-repo-item__desc">{repo.description}</p>
								)}
								<span className="hub-repo-item__meta">
									{opening === repo.fullName ? 'Opening workspace…' : 'Tap to open workspace →'}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}

			{connected && tab === 'recent' && (
				<>
					{loading ? (
						<p className="projects-page__hint">Loading…</p>
					) : projects.length === 0 ? (
						<div className="hub-empty hub-empty--compact">
							<p className="hub-empty__desc">Open a repository from the GitHub tab — it will show up here.</p>
						</div>
					) : (
						<ProjectList
							projects={projects}
							onSelect={onSelectProject}
							onRemoveLocal={handleRemoveLocal}
						/>
					)}
				</>
			)}

			<ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />
			<CreateRepoSheet
				open={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreated={onSelectProject}
			/>
		</main>
	)
}
