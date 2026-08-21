import type { WorkspaceView } from '../types/project'
import { NAV_ITEMS } from '../types/navigation'
import { IconAgent, IconChanges, IconFiles } from './Icons'
import '../styles/navigation.css'

type BottomNavProps = {
	activeView: WorkspaceView
	onNavigate: (view: WorkspaceView) => void
}

const ICONS = {
	agent: IconAgent,
	changes: IconChanges,
	files: IconFiles,
} as const

export function BottomNav({ activeView, onNavigate }: BottomNavProps) {
	return (
		<nav className="bottom-nav" aria-label="Workspace navigation">
			{NAV_ITEMS.map((item) => {
				const Icon = ICONS[item.id]
				const isActive = activeView === item.id
				return (
					<button
						key={item.id}
						type="button"
						className={`bottom-nav__item${isActive ? ' is-active' : ''}`}
						onClick={() => onNavigate(item.id)}
						aria-current={isActive ? 'page' : undefined}
					>
						<Icon className="bottom-nav__icon" />
						<span className="bottom-nav__label">{item.shortLabel}</span>
					</button>
				)
			})}
		</nav>
	)
}

export function SidebarNav({ activeView, onNavigate }: BottomNavProps) {
	return (
		<nav className="sidebar-nav" aria-label="Workspace navigation">
			{NAV_ITEMS.map((item) => {
				const Icon = ICONS[item.id]
				const isActive = activeView === item.id
				return (
					<button
						key={item.id}
						type="button"
						className={`sidebar-nav__item${isActive ? ' is-active' : ''}`}
						onClick={() => onNavigate(item.id)}
						aria-current={isActive ? 'page' : undefined}
					>
						<Icon className="sidebar-nav__icon" />
						<span className="sidebar-nav__label">{item.label}</span>
					</button>
				)
			})}
		</nav>
	)
}
