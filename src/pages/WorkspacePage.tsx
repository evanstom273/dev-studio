import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project, WorkspaceView } from '@shared/types/project'
import {
	IconChanges,
	IconFiles,
	IconRepo,
} from '../components/Icons'
import { ProjectHeader } from '../components/ProjectHeader'
import { KeyboardViewportProvider, useKeyboardViewport } from '../hooks/KeyboardViewportContext'
import { useWideLayout } from '../hooks/useMediaQuery'
import { gitApi } from '../services/gitApi'
import { AgentView, type AgentActions } from './AgentView'
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

type RightTool = 'changes' | 'files' | 'repo'

const RIGHT_TOOLS: { id: RightTool; label: string; Icon: typeof IconChanges }[] = [
	{ id: 'changes', label: 'Changes', Icon: IconChanges },
	{ id: 'files', label: 'Files', Icon: IconFiles },
	{ id: 'repo', label: 'Git', Icon: IconRepo },
]

function WorkspacePageContent({
	project,
	activeView,
	onNavigate,
	onBack,
}: WorkspacePageProps) {
	const isWide = useWideLayout()
	const { keyboardOpen } = useKeyboardViewport()
	const [rightTool, setRightTool] = useState<RightTool>('changes')
	const [changedCount, setChangedCount] = useState<number>(0)
	const [currentBranch, setCurrentBranch] = useState<string>('main')
	const [splitPercent, setSplitPercent] = useState<number>(50)
	const [agentActions, setAgentActions] = useState<AgentActions | null>(null)
	const isDraggingRef = useRef(false)
	const containerRef = useRef<HTMLDivElement>(null)

	// Fetch git status periodically or on mount to keep badge updated
	const refreshStatus = useCallback(async () => {
		try {
			const status = await gitApi.status(project.id)
			setChangedCount(status.changed.length)
			if (status.branch) setCurrentBranch(status.branch)
		} catch {
			// ignore git status error
		}
	}, [project.id])

	useEffect(() => {
		void refreshStatus()
	}, [refreshStatus])

	// Dragging logic for two-pane resizer
	const handlePointerDown = (e: React.PointerEvent) => {
		e.preventDefault()
		isDraggingRef.current = true

		const handlePointerMove = (moveEvent: PointerEvent) => {
			if (!isDraggingRef.current || !containerRef.current) return
			const rect = containerRef.current.getBoundingClientRect()
			const offsetX = moveEvent.clientX - rect.left
			const percentage = (offsetX / rect.width) * 100
			if (percentage >= 25 && percentage <= 75) {
				setSplitPercent(percentage)
			}
		}

		const handlePointerUp = () => {
			isDraggingRef.current = false
			window.removeEventListener('pointermove', handlePointerMove)
			window.removeEventListener('pointerup', handlePointerUp)
		}

		window.addEventListener('pointermove', handlePointerMove)
		window.addEventListener('pointerup', handlePointerUp)
	}

	// Double click divider to reset to 50/50
	const handleDoubleClick = () => {
		setSplitPercent(50)
	}

	const hideChrome = keyboardOpen && activeView === 'agent' && !isWide

	return (
		<div
			className={`app-shell app-shell--workspace${keyboardOpen ? ' app-shell--keyboard-open' : ''}`}
		>
			<div className="workspace-shell">
				<ProjectHeader
					project={project}
					onBack={onBack}
					className={hideChrome ? 'project-header--keyboard-hidden' : undefined}
					currentBranch={currentBranch}
					activeView={activeView}
					onNavigate={onNavigate}
					isWide={isWide}
					changedFilesCount={changedCount}
					onRunCommand={agentActions ? agentActions.runCommand : undefined}
					onClearChat={agentActions ? agentActions.clearChat : undefined}
				/>

				<div className="workspace-body" ref={containerRef}>
					{isWide ? (
						/* Unfolded Pixel Fold / Tablet / Desktop: Two-Pane Split Layout */
						<div className="workspace-split">
							{/* Left Pane: Full Agent Conversation + Composer */}
							<section
								className="workspace-pane workspace-pane--left"
								style={{ width: `${splitPercent}%` }}
								aria-label="Agent workspace"
							>
								<AgentView
									project={project}
									onRegisterActions={setAgentActions}
									keyboardOpen={keyboardOpen}
								/>
							</section>

							{/* Resizable Divider Handle */}
							<div
								className="workspace-divider"
								onPointerDown={handlePointerDown}
								onDoubleClick={handleDoubleClick}
								role="separator"
								aria-orientation="vertical"
								title="Drag to resize panes (double click to reset)"
							>
								<div className="workspace-divider__handle" />
							</div>

							{/* Right Pane: Contextual Tools (Changes, Files, Git) */}
							<section
								className="workspace-pane workspace-pane--right"
								style={{ width: `${100 - splitPercent}%` }}
								aria-label="Development tools"
							>
								{/* Horizontal Tool Switcher */}
								<div className="tool-switcher-bar">
									<div className="tool-switcher-tabs" role="tablist">
										{RIGHT_TOOLS.map((t) => {
											const isActive = rightTool === t.id
											const ToolIcon = t.Icon
											return (
												<button
													key={t.id}
													type="button"
													role="tab"
													aria-selected={isActive}
													className={`tool-switcher-tab${isActive ? ' is-active' : ''}`}
													onClick={() => setRightTool(t.id)}
												>
													<ToolIcon className="tool-switcher-tab__icon" />
													<span>{t.label}</span>
													{t.id === 'changes' && changedCount > 0 && (
														<span className="tool-switcher-tab__badge">{changedCount}</span>
													)}
												</button>
											)
										})}
									</div>
								</div>

								{/* Tool Pane Content */}
								<div className="tool-pane-content">
									{rightTool === 'changes' && <ChangesView project={project} />}
									{rightTool === 'files' && <FilesView project={project} />}
									{rightTool === 'repo' && <RepoView project={project} />}
								</div>
							</section>
						</div>
					) : (
						/* Folded Narrow Mobile: Single Focused Workspace Pane */
						<div className="workspace-main">
							{activeView === 'agent' && (
								<AgentView
									project={project}
									onRegisterActions={setAgentActions}
									keyboardOpen={keyboardOpen}
								/>
							)}
							{activeView === 'changes' && <ChangesView project={project} />}
							{activeView === 'files' && <FilesView project={project} />}
							{activeView === 'repo' && <RepoView project={project} />}
						</div>
					)}
				</div>
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
