import type { Project } from '@shared/types/project'
import '../styles/projects.css'

type ProjectListProps = {
	projects: Project[]
	onSelect: (project: Project) => void
	onRemoveLocal?: (project: Project) => void
}

export function ProjectList({ projects, onSelect, onRemoveLocal }: ProjectListProps) {
	return (
		<ul className="project-list">
			{projects.map((project) => (
				<li key={project.id} className="project-card-wrap">
					<button type="button" className="project-card" onClick={() => onSelect(project)}>
						<div className="project-card__row">
							<span className="project-card__name">{project.name}</span>
							{project.storage === 'github-cache' && (
								<span className="hub-badge hub-badge--cache">cached</span>
							)}
						</div>
						{(project.githubFullName ?? project.repositoryLabel) && (
							<span className="project-card__repo">
								{project.githubFullName ?? project.repositoryLabel}
							</span>
						)}
						<span className="project-card__activity">
							{project.storage === 'github-cache'
								? 'Workspace on laptop · syncs to GitHub'
								: project.lastActivity}
						</span>
					</button>
					{project.storage === 'github-cache' && onRemoveLocal && (
						<button
							type="button"
							className="project-card__remove"
							onClick={() => onRemoveLocal(project)}
							aria-label={`Remove local copy of ${project.name}`}
						>
							Remove local
						</button>
					)}
				</li>
			))}
		</ul>
	)
}
