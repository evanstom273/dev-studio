import type { CSSProperties } from 'react'
import type { Project, WorkspaceView } from '@shared/types/project'
import { BottomNav, SidebarNav } from '../components/Navigation'
import { ProjectHeader } from '../components/ProjectHeader'
import { KeyboardViewportProvider, useKeyboardViewport } from '../hooks/KeyboardViewportContext'
import { AgentView } from './AgentView'
import { ChangesView } from './ChangesView'
import { FilesView } from './FilesView'
import { RepoView } from './RepoView'
import '../styles/layout.css'

type WorkspacePageProps = {
	project: Project
	activeView: WorkspaceView
	onNavigate: (view: WorkspaceView) => void
	onBack: () => void
}

function WorkspacePageContent({
	project,
	activeView,
	onNavigate,
	onBack,
}: WorkspacePageProps) {
	const { keyboardOpen, height, offsetTop } = useKeyboardViewport()

	const shellStyle: CSSProperties | undefined = keyboardOpen
		? {
				height: `${height}px`,
				transform: `translateY(${offsetTop}px)`,
			}
		: undefined

	const hideChrome = keyboardOpen && activeView === 'agent'

	return (
		<div className="app-shell app-shell--workspace">
			<aside className="workspace-sidebar">
				<SidebarNav activeView={activeView} onNavigate={onNavigate} />
			</aside>

			<div
				className={`workspace-shell${keyboardOpen ? ' workspace-shell--keyboard-open' : ''}`}
				style={shellStyle}
			>
				<ProjectHeader
					project={project}
					onBack={onBack}
					className={hideChrome ? 'project-header--keyboard-hidden' : undefined}
				/>

				<div className="workspace-body">
					<div className="workspace-main">
						{activeView === 'agent' && (
							<AgentView project={project} keyboardOpen={keyboardOpen} />
						)}
						{activeView === 'changes' && <ChangesView project={project} />}
						{activeView === 'files' && <FilesView project={project} />}
						{activeView === 'repo' && <RepoView project={project} />}
					</div>
				</div>

				{!keyboardOpen && <BottomNav activeView={activeView} onNavigate={onNavigate} />}
			</div>
		</div>
	)
}

export function WorkspacePage(props: WorkspacePageProps) {
	return (
		<KeyboardViewportProvider>
			<WorkspacePageContent {...props} />
		</KeyboardViewportProvider>
	)
}
