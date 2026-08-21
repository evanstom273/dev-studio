import type { Project, WorkspaceView } from '../types/project'
import { BottomNav, SidebarNav } from '../components/Navigation'
import { ProjectHeader } from '../components/ProjectHeader'
import { AgentView } from './AgentView'
import { ChangesView } from './ChangesView'
import { FilesView } from './FilesView'
import '../styles/layout.css'

type WorkspacePageProps = {
	project: Project
	activeView: WorkspaceView
	onNavigate: (view: WorkspaceView) => void
	onBack: () => void
}

export function WorkspacePage({
	project,
	activeView,
	onNavigate,
	onBack,
}: WorkspacePageProps) {
	return (
		<div className="app-shell app-shell--workspace">
			<aside className="workspace-sidebar">
				<SidebarNav activeView={activeView} onNavigate={onNavigate} />
			</aside>

			<div className="workspace-shell">
				<ProjectHeader project={project} onBack={onBack} />

				<div className="workspace-body">
					<div className="workspace-main">
						{activeView === 'agent' && <AgentView />}
						{activeView === 'changes' && <ChangesView />}
						{activeView === 'files' && <FilesView />}
					</div>
				</div>

				<BottomNav activeView={activeView} onNavigate={onNavigate} />
			</div>
		</div>
	)
}
