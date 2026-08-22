import { useEffect, useRef, useState } from 'react'
import type { Project } from '@shared/types/project'
import { useConnection } from '../hooks/useConnection'
import { RUN_COMMANDS } from '../types/index'
import {
	IconBack,
	IconBranch,
	IconDots,
	IconFolder,
	IconTerminal,
	IconTrash,
} from './Icons'
import '../styles/agent.css'

type ProjectHeaderProps = {
	project: Project
	onBack: () => void
	className?: string
	currentBranch?: string
	onRunCommand?: (command: string, label: string) => void
	onClearChat?: () => void
}

export function ProjectHeader({
	project,
	onBack,
	className,
	currentBranch = 'main',
	onRunCommand,
	onClearChat,
}: ProjectHeaderProps) {
	const { state } = useConnection()
	const [menuOpen, setMenuOpen] = useState(false)
	const menuRef = useRef<HTMLDivElement>(null)

	// Close menu on click outside
	useEffect(() => {
		if (!menuOpen) return
		const handlePointerDown = (e: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false)
			}
		}
		window.addEventListener('pointerdown', handlePointerDown)
		return () => window.removeEventListener('pointerdown', handlePointerDown)
	}, [menuOpen])

	const statusClass =
		state.status === 'connected'
			? 'project-header__status-dot--connected'
			: state.status === 'connecting'
				? 'project-header__status-dot--reconnecting'
				: 'project-header__status-dot--error'

	const statusTitle =
		state.status === 'connected'
			? 'Connected to laptop'
			: state.status === 'connecting'
				? 'Connecting to laptop...'
				: 'Disconnected'

	return (
		<header className={`project-header${className ? ` ${className}` : ''}`}>
			{/* Left: Back Arrow + Project Name + Branch */}
			<div className="project-header__left">
				<button
					type="button"
					className="project-header__back"
					onClick={onBack}
					aria-label="Back to projects"
					title="Back to all projects"
				>
					<IconBack className="project-header__icon" />
				</button>

				<div className="project-header__title-group">
					<div className="project-header__name-row">
						<span className="project-header__name">{project.name}</span>
						<span
							className={`project-header__status-dot ${statusClass}`}
							title={`Laptop: ${statusTitle}`}
						/>
					</div>

					{project.isGitRepo ? (
						<div className="project-header__branch-badge" title={`Branch: ${currentBranch}`}>
							<IconBranch className="project-header__branch-icon" />
							<span className="project-header__branch-name">{currentBranch}</span>
						</div>
					) : (
						<div className="project-header__branch-badge" title={`Local folder: ${project.path}`}>
							<IconFolder className="project-header__branch-icon" />
							<span className="project-header__branch-name">Local</span>
						</div>
					)}
				</div>
			</div>

			{/* Right: Overflow menu */}
			<div className="project-header__right" ref={menuRef}>
				<button
					type="button"
					className={`project-header__menu-btn${menuOpen ? ' is-active' : ''}`}
					onClick={() => setMenuOpen((prev) => !prev)}
					aria-label="Project actions"
					title="Project actions"
				>
					<IconDots className="project-header__icon" />
				</button>

				{menuOpen && (
					<div className="project-header__dropdown" role="menu">
						<div className="project-header__dropdown-header">Quick Commands</div>
						{RUN_COMMANDS.map((cmd) => (
							<button
								key={cmd.id}
								type="button"
								className="project-header__dropdown-item"
								role="menuitem"
								onClick={() => {
									onRunCommand?.(cmd.command, cmd.label)
									setMenuOpen(false)
								}}
							>
								<IconTerminal className="project-header__dropdown-icon" />
								<span>{cmd.label}</span>
							</button>
						))}

						<div className="project-header__dropdown-divider" />

						{onClearChat && (
							<button
								type="button"
								className="project-header__dropdown-item project-header__dropdown-item--danger"
								role="menuitem"
								onClick={() => {
									onClearChat()
									setMenuOpen(false)
								}}
							>
								<IconTrash className="project-header__dropdown-icon" />
								<span>Clear conversation</span>
							</button>
						)}
					</div>
				)}
			</div>
		</header>
	)
}

