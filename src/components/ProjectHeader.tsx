import type { Project } from '@shared/types/project'
import { IconBack } from './Icons'
import '../styles/agent.css'

type ProjectHeaderProps = {
	project: Project
	onBack: () => void
	className?: string
}

export function ProjectHeader({ project, onBack, className }: ProjectHeaderProps) {
	return (
		<header className={`project-header${className ? ` ${className}` : ''}`}>
			<button
				type="button"
				className="project-header__back"
				onClick={onBack}
				aria-label="Back to projects"
			>
				<IconBack className="bottom-nav__icon" />
			</button>
			<div className="project-header__info">
				<div className="project-header__name">{project.name}</div>
				{project.repositoryLabel && (
					<div className="project-header__repo">{project.repositoryLabel}</div>
				)}
			</div>
		</header>
	)
}
