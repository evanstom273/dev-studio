import { useState } from 'react'
import type { AppRoute, Project, WorkspaceView } from '@shared/types/project'
import { ProjectsPage } from './pages/ProjectsPage'
import { SettingsPage } from './pages/SettingsPage'
import { WorkspacePage } from './pages/WorkspacePage'
import { ConnectionProvider } from './hooks/useConnection'

function AppRoutes() {
	const [route, setRoute] = useState<AppRoute>('projects')
	const [selectedProject, setSelectedProject] = useState<Project | null>(null)
	const [activeView, setActiveView] = useState<WorkspaceView>('agent')

	const handleSelectProject = (project: Project) => {
		setSelectedProject(project)
		setActiveView('agent')
		setRoute('workspace')
	}

	const handleBack = () => {
		setRoute('projects')
		setSelectedProject(null)
	}

	if (route === 'settings') {
		return <SettingsPage onBack={() => setRoute('projects')} />
	}

	if (route === 'workspace' && selectedProject) {
		return (
			<WorkspacePage
				project={selectedProject}
				activeView={activeView}
				onNavigate={setActiveView}
				onBack={handleBack}
			/>
		)
	}

	return (
		<div className="app-shell">
			<ProjectsPage
				onSelectProject={handleSelectProject}
				onOpenSettings={() => setRoute('settings')}
			/>
		</div>
	)
}

export function App() {
	return (
		<ConnectionProvider>
			<AppRoutes />
		</ConnectionProvider>
	)
}
