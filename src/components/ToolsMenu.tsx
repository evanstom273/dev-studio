import { useEffect, useRef } from 'react'
import type { ToolId } from '@shared/types/project'
import {
	IconArtifact,
	IconBrowser,
	IconCode,
	IconPlan,
	IconProblem,
	IconProcess,
	IconTerminal,
} from './Icons'
import '../styles/tools-menu.css'

export type ToolItem = {
	id: ToolId
	label: string
	description: string
	Icon: typeof IconCode
}

export const AVAILABLE_TOOLS: ToolItem[] = [
	{
		id: 'editor',
		label: 'Code Editor',
		description: 'Inspect and edit project files directly',
		Icon: IconCode,
	},
	{
		id: 'terminal',
		label: 'Terminal',
		description: 'Interactive persistent shell on laptop worker',
		Icon: IconTerminal,
	},
	{
		id: 'artifacts',
		label: 'Artifacts',
		description: 'Plans, specifications, diagrams & notes',
		Icon: IconArtifact,
	},
	{
		id: 'processes',
		label: 'Processes & Servers',
		description: 'Inspect dev servers, ports and background processes',
		Icon: IconProcess,
	},
	{
		id: 'problems',
		label: 'Problems',
		description: 'Actionable diagnostics, conflicts and errors',
		Icon: IconProblem,
	},
	{
		id: 'plans',
		label: 'Tasks / Plans',
		description: 'Structured agent execution plans and steps',
		Icon: IconPlan,
	},
	{
		id: 'browser',
		label: 'Browser',
		description: 'Dedicated Chromium browser on laptop with screencast',
		Icon: IconBrowser,
	},
]

type ToolsMenuProps = {
	isOpen: boolean
	onClose: () => void
	onSelectTool: (toolId: ToolId) => void
	activeTool?: ToolId | null
	problemsCount?: number
	problemsErrors?: number
}

export function ToolsMenu({
	isOpen,
	onClose,
	onSelectTool,
	activeTool,
	problemsCount,
	problemsErrors,
}: ToolsMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!isOpen) return

		const handlePointerDown = (e: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose()
			}
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose()
			}
		}

		window.addEventListener('pointerdown', handlePointerDown)
		window.addEventListener('keydown', handleKeyDown)
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown)
			window.removeEventListener('keydown', handleKeyDown)
		}
	}, [isOpen, onClose])

	if (!isOpen) return null

	return (
		<div className="tools-menu-overlay">
			<div className="tools-menu" ref={menuRef} role="menu" aria-label="Tools menu">
				<div className="tools-menu__header">
					<span className="tools-menu__title">Workspace Tools</span>
					<button
						type="button"
						className="tools-menu__close-btn"
						onClick={onClose}
						aria-label="Close tools menu"
					>
						✕
					</button>
				</div>

				<div className="tools-menu__list">
					{AVAILABLE_TOOLS.map((tool) => {
						const Icon = tool.Icon
						const isActive = activeTool === tool.id
						return (
							<button
								key={tool.id}
								type="button"
								role="menuitem"
								className={`tools-menu__item${isActive ? ' is-active' : ''}`}
								onClick={() => {
									onSelectTool(tool.id)
									onClose()
								}}
							>
								<div className="tools-menu__item-icon-wrap">
									<Icon className="tools-menu__item-icon" />
								</div>
								<div className="tools-menu__item-text">
									<div className="tools-menu__item-label-row">
										<span className="tools-menu__item-label">{tool.label}</span>
										{tool.id === 'problems' && problemsCount !== undefined && problemsCount > 0 && (
											<span
												className={`tools-menu__badge${problemsErrors && problemsErrors > 0 ? ' tools-menu__badge--error' : ''}`}
											>
												{problemsCount}
											</span>
										)}
									</div>
									<span className="tools-menu__item-desc">{tool.description}</span>
								</div>
								{isActive && <span className="tools-menu__item-active-dot" />}
							</button>
						)
					})}
				</div>
			</div>
		</div>
	)
}
