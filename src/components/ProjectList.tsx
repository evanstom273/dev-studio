import type { Project } from '@shared/types/project'
import { IconBranch, IconFolder, IconRepo } from './Icons'
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
				<p className="hub-empty__desc">No recent workspaces. Open a local folder or pick a repo from GitHub to get started.</p>
			</div>
		)
	}

	return (
		<div className="project-list" role="list">
			<div className="project-list__section-title">Recent Workspaces</div>
			{projects.map((project) => {
				const isLocal = project.workspaceSource === 'local' || project.storage === 'local'
				const isMissing = project.exists === false
				const displayLabel = isLocal
					? project.path
					: project.githubFullName ?? project.repositoryLabel ?? project.path

				return (
					<div key={project.id} className={`project-card-wrap${isMissing ? ' project-card-wrap--missing' : ''}`}>
						<button
							type="button"
							className="project-card"
							onClick={() => onSelect(project)}
							role="listitem"
							title={isMissing ? `Folder not found: ${project.path}` : project.path}
						>
							<div className="project-card__icon-col">
								{isLocal ? (
									<IconFolder className="project-card__icon" />
								) : (
									<IconBranch className="project-card__icon" />
								)}
							</div>

							<div className="project-card__content">
								<div className="project-card__top">
									<span className="project-card__name">{project.name}</span>
									{isMissing ? (
										<span className="hub-badge hub-badge--missing">Missing</span>
									) : isLocal ? (
										<span className="hub-badge hub-badge--local">Local</span>
									) : (
										<span className="hub-badge hub-badge--managed">Managed</span>
									)}
								</div>

								<div className="project-card__meta-row">
									<span className="project-card__repo" title={displayLabel}>
										{isLocal ? (
											<IconFolder className="project-card__repo-icon" />
										) : (
											<IconRepo className="project-card__repo-icon" />
										)}
										{displayLabel}
									</span>
									<span className="project-card__dot">·</span>
									<span className="project-card__activity">
										{isMissing ? 'Folder inaccessible' : project.isGitRepo ? 'Git repo' : 'Local folder'}
									</span>
								</div>
							</div>
						</button>

						{onRemoveLocal && (
							<button
								type="button"
								className="project-card__remove"
								onClick={(e) => {
									e.stopPropagation()
									onRemoveLocal(project)
								}}
								aria-label={`Remove ${project.name} from Dev Studio`}
								title={isLocal ? 'Remove from recent list (folder is preserved)' : 'Remove local workspace cache'}
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
