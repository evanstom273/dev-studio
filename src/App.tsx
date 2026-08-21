import { useState } from 'react'
import type { AppRoute, WorkspaceView } from './types/project'
import { ProjectsPage } from './pages/ProjectsPage'
import { WorkspacePage } from './pages/WorkspacePage'
import { MOCK_PROJECTS } from './services/mockData'

export function App() {
	const [route, setRoute] = useState<AppRoute>('projects')
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
	const [activeView, setActiveView] = useState<WorkspaceView>('agent')

	const selectedProject = MOCK_PROJECTS.find((p) => p.id === selectedProjectId) ?? null

	const handleSelectProject = (projectId: string) => {
		setSelectedProjectId(projectId)
		setActiveView('agent')
		setRoute('workspace')
	}

	const handleBack = () => {
		setRoute('projects')
		setSelectedProjectId(null)
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
			<ProjectsPage onSelectProject={handleSelectProject} />
		</div>
	)
}
