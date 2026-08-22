import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project, ToolId, WorkspaceView } from '@shared/types/project'
import {
	IconArtifact,
	IconChanges,
	IconChat,
	IconCode,
	IconDots,
	IconFiles,
	IconRepo,
	IconStatus,
	IconTerminal,
} from '../components/Icons'
import { ProjectHeader } from '../components/ProjectHeader'
import { ToolsMenu } from '../components/ToolsMenu'
import { KeyboardViewportProvider, useKeyboardViewport } from '../hooks/KeyboardViewportContext'
import { useWideLayout } from '../hooks/useMediaQuery'
import { gitApi } from '../services/gitApi'
import { AgentView, type AgentActions } from './AgentView'
import { ArtifactsView } from './ArtifactsView'
import { ChangesView } from './ChangesView'
import { EditorView } from './EditorView'
import { FilesView } from './FilesView'
import { RepoView } from './RepoView'
import { StatusView } from './StatusView'
import { TerminalView } from './TerminalView'
import '../styles/layout.css'

type WorkspacePageProps = {
	project: Project
	activeView: WorkspaceView
	onNavigate: (view: WorkspaceView) => void
	onBack: () => void
}

type RightTool = 'changes' | 'files' | 'repo' | 'status' | 'editor' | 'terminal' | 'artifacts'

const PRIMARY_RIGHT_TOOLS: { id: 'changes' | 'files' | 'repo' | 'status'; label: string; Icon: typeof IconChanges }[] = [
	{ id: 'changes', label: 'Changes', Icon: IconChanges },
	{ id: 'files', label: 'Files', Icon: IconFiles },
	{ id: 'repo', label: 'Git', Icon: IconRepo },
	{ id: 'status', label: 'Status', Icon: IconStatus },
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
	const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
	const [editorFilePath, setEditorFilePath] = useState<string | null>(null)
	const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null)

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

	const handleDoubleClick = () => {
		setSplitPercent(50)
	}

	const handleOpenInEditor = (filePath: string) => {
		setEditorFilePath(filePath)
		if (isWide) {
			setRightTool('editor')
		} else {
			onNavigate('editor')
		}
	}

	const handleSendToChat = (contextSnippet: string) => {
		setPendingChatPrompt(contextSnippet)
	}

	const handleSelectTool = (toolId: ToolId) => {
		if (isWide) {
			setRightTool(toolId)
		} else {
			onNavigate(toolId)
		}
	}

	const isToolActiveMobile = ['editor', 'terminal', 'artifacts'].includes(activeView)
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
					onRunCommand={agentActions ? agentActions.runCommand : undefined}
					onClearChat={agentActions ? agentActions.clearChat : undefined}
				/>

				{!isWide && (
					<nav
						className={`workspace-mobile-nav${hideChrome ? ' workspace-mobile-nav--keyboard-hidden' : ''}`}
						aria-label="Workspace navigation"
					>
						<button
							type="button"
							className={`workspace-mobile-nav__tab${activeView === 'agent' ? ' is-active' : ''}`}
							onClick={() => onNavigate('agent')}
							title="Chat"
						>
							<IconChat className="workspace-mobile-nav__icon" />
							<span>Chat</span>
						</button>

						<button
							type="button"
							className={`workspace-mobile-nav__tab${activeView === 'changes' ? ' is-active' : ''}`}
							onClick={() => onNavigate('changes')}
							title="Changes"
						>
							<IconChanges className="workspace-mobile-nav__icon" />
							<span>Changes</span>
							{changedCount > 0 && (
								<span className="workspace-mobile-nav__badge">{changedCount}</span>
							)}
						</button>

						<button
							type="button"
							className={`workspace-mobile-nav__tab${activeView === 'files' ? ' is-active' : ''}`}
							onClick={() => onNavigate('files')}
							title="Files"
						>
							<IconFiles className="workspace-mobile-nav__icon" />
							<span>Files</span>
						</button>

						<button
							type="button"
							className={`workspace-mobile-nav__tab${activeView === 'repo' ? ' is-active' : ''}`}
							onClick={() => onNavigate('repo')}
							title="Git / Repo"
						>
							<IconRepo className="workspace-mobile-nav__icon" />
							<span>Git</span>
						</button>

						<button
							type="button"
							className={`workspace-mobile-nav__tab${activeView === 'status' ? ' is-active' : ''}`}
							onClick={() => onNavigate('status')}
							title="Status & Quota"
						>
							<IconStatus className="workspace-mobile-nav__icon" />
							<span>Status</span>
						</button>

						<button
							type="button"
							className={`workspace-mobile-nav__tab${isToolActiveMobile ? ' is-active' : ''}`}
							onClick={() => setToolsMenuOpen(true)}
							title="More Tools"
							aria-label="Tools"
						>
							{activeView === 'editor' ? (
								<IconCode className="workspace-mobile-nav__icon" />
							) : activeView === 'terminal' ? (
								<IconTerminal className="workspace-mobile-nav__icon" />
							) : activeView === 'artifacts' ? (
								<IconArtifact className="workspace-mobile-nav__icon" />
							) : (
								<IconDots className="workspace-mobile-nav__icon" />
							)}
							<span>
								{activeView === 'editor'
									? 'Editor'
									: activeView === 'terminal'
									? 'Term'
									: activeView === 'artifacts'
									? 'Artifacts'
									: 'Tools'}
							</span>
						</button>
					</nav>
				)}

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
									initialPrompt={pendingChatPrompt}
									onClearInitialPrompt={() => setPendingChatPrompt(null)}
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

							{/* Right Pane: Contextual Tools */}
							<section
								className="workspace-pane workspace-pane--right"
								style={{ width: `${100 - splitPercent}%` }}
								aria-label="Development tools"
							>
								{/* Horizontal Tool Switcher */}
								<div className="tool-switcher-bar">
									<div className="tool-switcher-tabs" role="tablist">
										{PRIMARY_RIGHT_TOOLS.map((t) => {
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

										{/* If an extended tool is active, display it in the tabs */}
										{rightTool === 'editor' && (
											<button
												type="button"
												role="tab"
												aria-selected={true}
												className="tool-switcher-tab is-active"
												onClick={() => setRightTool('editor')}
											>
												<IconCode className="tool-switcher-tab__icon" />
												<span>Editor</span>
											</button>
										)}
										{rightTool === 'terminal' && (
											<button
												type="button"
												role="tab"
												aria-selected={true}
												className="tool-switcher-tab is-active"
												onClick={() => setRightTool('terminal')}
											>
												<IconTerminal className="tool-switcher-tab__icon" />
												<span>Terminal</span>
											</button>
										)}
										{rightTool === 'artifacts' && (
											<button
												type="button"
												role="tab"
												aria-selected={true}
												className="tool-switcher-tab is-active"
												onClick={() => setRightTool('artifacts')}
											>
												<IconArtifact className="tool-switcher-tab__icon" />
												<span>Artifacts</span>
											</button>
										)}

										{/* Tools '…' Popup Trigger */}
										<button
											type="button"
											className="tool-switcher-tab tool-switcher-tab--more"
											onClick={() => setToolsMenuOpen(true)}
											title="More tools (Editor, Terminal, Artifacts)"
											aria-label="More tools"
										>
											<IconDots className="tool-switcher-tab__icon" />
											<span>Tools</span>
										</button>
									</div>
								</div>

								{/* Tool Pane Content */}
								<div className="tool-pane-content">
									{rightTool === 'changes' && <ChangesView project={project} />}
									{rightTool === 'files' && (
										<FilesView project={project} onOpenInEditor={handleOpenInEditor} />
									)}
									{rightTool === 'repo' && <RepoView project={project} />}
									{rightTool === 'status' && (
										<StatusView project={project} onRefreshProject={refreshStatus} />
									)}
									{rightTool === 'editor' && (
										<EditorView
											project={project}
											initialFilePath={editorFilePath}
											onSendToChat={handleSendToChat}
											onNavigateToChat={() => onNavigate('agent')}
										/>
									)}
									{rightTool === 'terminal' && <TerminalView project={project} />}
									{rightTool === 'artifacts' && (
										<ArtifactsView
											project={project}
											onSendToChat={handleSendToChat}
											onNavigateToChat={() => onNavigate('agent')}
											onOpenInEditor={handleOpenInEditor}
										/>
									)}
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
									initialPrompt={pendingChatPrompt}
									onClearInitialPrompt={() => setPendingChatPrompt(null)}
								/>
							)}
							{activeView === 'changes' && <ChangesView project={project} />}
							{activeView === 'files' && (
								<FilesView project={project} onOpenInEditor={handleOpenInEditor} />
							)}
							{activeView === 'repo' && <RepoView project={project} />}
							{activeView === 'status' && (
								<StatusView project={project} onRefreshProject={refreshStatus} />
							)}
							{activeView === 'editor' && (
								<EditorView
									project={project}
									initialFilePath={editorFilePath}
									onSendToChat={handleSendToChat}
									onNavigateToChat={() => onNavigate('agent')}
								/>
							)}
							{activeView === 'terminal' && <TerminalView project={project} />}
							{activeView === 'artifacts' && (
								<ArtifactsView
									project={project}
									onSendToChat={handleSendToChat}
									onNavigateToChat={() => onNavigate('agent')}
									onOpenInEditor={handleOpenInEditor}
								/>
							)}
						</div>
					)}
				</div>

				{/* Tools Selection Menu Popover */}
				<ToolsMenu
					isOpen={toolsMenuOpen}
					onClose={() => setToolsMenuOpen(false)}
					onSelectTool={handleSelectTool}
					activeTool={
						isWide
							? ['editor', 'terminal', 'artifacts'].includes(rightTool)
								? (rightTool as ToolId)
								: null
							: ['editor', 'terminal', 'artifacts'].includes(activeView)
							? (activeView as ToolId)
							: null
					}
				/>
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
