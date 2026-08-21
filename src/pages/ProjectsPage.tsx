import { ProjectList } from '../components/ProjectList'
import { MOCK_PROJECTS } from '../services/mockData'
import '../styles/projects.css'

type ProjectsPageProps = {
	onSelectProject: (projectId: string) => void
}

export function ProjectsPage({ onSelectProject }: ProjectsPageProps) {
	return (
		<main className="projects-page">
			<header className="projects-page__header">
				<h1 className="projects-page__title">Dev Studio</h1>
				<p className="projects-page__subtitle">
					Select a project to open the agent workspace
				</p>
			</header>
			<ProjectList projects={MOCK_PROJECTS} onSelect={onSelectProject} />
		</main>
	)
}
