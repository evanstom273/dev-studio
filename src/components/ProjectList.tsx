import type { Project } from '../types/project'
import '../styles/projects.css'

type ProjectListProps = {
	projects: Project[]
	onSelect: (projectId: string) => void
}

export function ProjectList({ projects, onSelect }: ProjectListProps) {
	return (
		<ul className="project-list">
			{projects.map((project) => (
				<li key={project.id}>
					<button
						type="button"
						className="project-card"
						onClick={() => onSelect(project.id)}
					>
						<span className="project-card__name">{project.name}</span>
						{project.repositoryLabel && (
							<span className="project-card__repo">{project.repositoryLabel}</span>
						)}
						<span className="project-card__activity">{project.lastActivity}</span>
					</button>
				</li>
			))}
		</ul>
	)
}
