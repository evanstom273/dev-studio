import type { Project } from '@shared/types/project'
import { IconBranch, IconRepo } from './Icons'
import '../styles/projects.css'

type ProjectListProps = {
	projects: Project[]
	onSelect: (project: Project) => void
	onRemoveLocal?: (project: Project) => void
}

export function ProjectList({ projects, onSelect, onRemoveLocal }: ProjectListProps) {
	if (projects.length === 0) {
		return (
			<div className="hub-empty hub-empty--compact">
				<p className="hub-empty__desc">No projects found. Pick a repo from GitHub to get started.</p>
			</div>
		)
	}

	return (
		<div className="project-list" role="list">
			<div className="project-list__section-title">Recent Workspaces</div>
			{projects.map((project) => {
				const repoLabel = project.githubFullName ?? project.repositoryLabel ?? project.name

				return (
					<div key={project.id} className="project-card-wrap">
						<button
							type="button"
							className="project-card"
							onClick={() => onSelect(project)}
							role="listitem"
						>
							<div className="project-card__icon-col">
								<IconBranch className="project-card__icon" />
							</div>

							<div className="project-card__content">
								<div className="project-card__top">
									<span className="project-card__name">{project.name}</span>
									{project.storage === 'github-cache' && (
										<span className="hub-badge hub-badge--cache">cached</span>
									)}
								</div>

								<div className="project-card__meta-row">
									<span className="project-card__repo">
										<IconRepo className="project-card__repo-icon" />
										{repoLabel}
									</span>
									<span className="project-card__dot">·</span>
									<span className="project-card__activity">
										{project.lastActivity || 'Active recently'}
									</span>
								</div>
							</div>
						</button>

						{project.storage === 'github-cache' && onRemoveLocal && (
							<button
								type="button"
								className="project-card__remove"
								onClick={(e) => {
									e.stopPropagation()
									onRemoveLocal(project)
								}}
								aria-label={`Remove local copy of ${project.name}`}
								title="Remove local workspace"
							>
								Remove
							</button>
						)}
					</div>
				)
			})}
		</div>
	)
}
