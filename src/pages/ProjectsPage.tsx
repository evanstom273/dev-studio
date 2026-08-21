import { useCallback, useEffect, useState } from 'react'
import type { Project } from '@shared/types/project'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { ProjectList } from '../components/ProjectList'
import { useConnection } from '../hooks/useConnection'
import { agentApi } from '../services/agentApi'
import { projectsApi } from '../services/gitApi'
import '../styles/projects.css'

type ProjectsPageProps = {
	onSelectProject: (project: Project) => void
	onOpenSettings: () => void
}

export function ProjectsPage({ onSelectProject, onOpenSettings }: ProjectsPageProps) {
	const { state } = useConnection()
	const [projects, setProjects] = useState<Project[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const loadProjects = useCallback(async () => {
		if (state.status !== 'connected') {
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
	}, [state.status])

	useEffect(() => {
		void loadProjects()
	}, [loadProjects])

	const handleClone = async () => {
		const url = prompt('Repository URL to clone:')
		if (!url) return
		try {
			const project = await projectsApi.clone({ url })
			await loadProjects()
			onSelectProject(project)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Clone failed')
		}
	}

	const handleInit = async () => {
		const path = prompt('Local path for new repository (on laptop):')
		if (!path) return
		const name = prompt('Project name (optional):') ?? undefined
		try {
			const project = await projectsApi.init({ path, name })
			await loadProjects()
			onSelectProject(project)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Init failed')
		}
	}

	return (
		<main className="projects-page">
			<header className="projects-page__header">
				<div className="projects-page__top">
					<div>
						<h1 className="projects-page__title">Dev Studio</h1>
						<p className="projects-page__subtitle">Select a project to open the agent workspace</p>
					</div>
					<button type="button" className="btn btn--ghost" onClick={onOpenSettings}>
						Settings
					</button>
				</div>
			</header>

			<ConnectionBanner />

			{state.status !== 'connected' && (
				<p className="projects-page__hint">
					Connect to your laptop backend in Settings to load projects.
				</p>
			)}

			{error && <div className="panel-message">{error}</div>}

			<div className="projects-page__actions">
				<button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadProjects()} disabled={loading}>
					Refresh
				</button>
				<button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleInit()} disabled={state.status !== 'connected'}>
					Init repo
				</button>
				<button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleClone()} disabled={state.status !== 'connected'}>
					Clone
				</button>
			</div>

			{loading ? (
				<p className="projects-page__hint">Loading projects...</p>
			) : (
				<ProjectList projects={projects} onSelect={onSelectProject} />
			)}
		</main>
	)
}
