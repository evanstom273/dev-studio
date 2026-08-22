import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project, ToolId, WorkspaceView } from '@shared/types/project'
import type { ProblemSummary } from '@shared/types/problem'
import {
	IconArtifact,
	IconBrowser,
	IconChanges,
	IconChat,
	IconCode,
	IconDots,
	IconFiles,
	IconPlan,
	IconProblem,
	IconProcess,
	IconRepo,
	IconStatus,
	IconTerminal,
} from '../components/Icons'
import { ProjectHeader } from '../components/ProjectHeader'
import { ToolsMenu } from '../components/ToolsMenu'
import { KeyboardViewportProvider, useKeyboardViewport } from '../hooks/KeyboardViewportContext'
import { useWideLayout } from '../hooks/useMediaQuery'
import { gitApi } from '../services/gitApi'
import { problemApi } from '../services/problemApi'
import { browserApi } from '../services/browserApi'
import { AgentView, type AgentActions } from './AgentView'
import { ArtifactsView } from './ArtifactsView'
import { ChangesView } from './ChangesView'
import { EditorView } from './EditorView'
import { FilesView } from './FilesView'
import { RepoView } from './RepoView'
import { StatusView } from './StatusView'
import { TerminalView } from './TerminalView'
import { ProcessesView } from './ProcessesView'
import { ProblemsView } from './ProblemsView'
import { PlansView } from './PlansView'
import { BrowserView } from './BrowserView'
import '../styles/layout.css'

type WorkspacePageProps = {
	project: Project
	activeView: WorkspaceView
	onNavigate: (view: WorkspaceView) => void
	onBack: () => void
}

type RightTool =
	| 'changes'
	| 'files'
	| 'repo'
	| 'status'
	| 'editor'
	| 'terminal'
	| 'artifacts'
	| 'processes'
	| 'problems'
	| 'plans'
	| 'browser'

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
	const [problemsSummary, setProblemsSummary] = useState<ProblemSummary | null>(null)
	const [splitPercent, setSplitPercent] = useState<number>(50)
	const [agentActions, setAgentActions] = useState<AgentActions | null>(null)
	const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
	const [editorFilePath, setEditorFilePath] = useState<string | null>(null)
	const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null)

	const isDraggingRef = useRef(false)
	const containerRef = useRef<HTMLDivElement>(null)

	// Fetch git status and problems summary periodically or on mount to keep badge updated
	const refreshStatus = useCallback(async () => {
		try {
			const [status, summary] = await Promise.all([
				gitApi.status(project.id).catch(() => null),
				problemApi.getSummary(project.id).catch(() => null),
			])
			if (status) {
				setChangedCount(status.changed.length)
				if (status.branch) setCurrentBranch(status.branch)
			}
			if (summary) {
				setProblemsSummary(summary)
			}
		} catch {
			// ignore status error
		}
	}, [project.id])

	useEffect(() => {
		void refreshStatus()
		const interval = setInterval(() => {
			void refreshStatus()
		}, 15000)
		return () => clearInterval(interval)
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

	const handleOpenInEditor = (filePath: string, _line?: number) => {
		setEditorFilePath(filePath)
		if (isWide) {
			setRightTool('editor')
		} else {
			onNavigate('editor')
		}
	}

	const handleOpenInTerminal = (_sessionId?: string) => {
		if (isWide) {
			setRightTool('terminal')
		} else {
			onNavigate('terminal')
		}
	}

	const handleOpenArtifact = (_artifactId?: string) => {
		if (isWide) {
			setRightTool('artifacts')
		} else {
			onNavigate('artifacts')
		}
	}

	const handleOpenProblem = (_problemId?: string) => {
		if (isWide) {
			setRightTool('problems')
		} else {
			onNavigate('problems')
		}
	}

	const handleOpenInBrowser = (url: string) => {
		void browserApi.createTab({ url }).catch(() => {})
		if (isWide) {
			setRightTool('browser')
		} else {
			onNavigate('browser')
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

	const isExtendedTool = (tool: string): tool is ToolId =>
		['editor', 'terminal', 'artifacts', 'processes', 'problems', 'plans', 'browser'].includes(tool)

	const isToolActiveMobile = isExtendedTool(activeView)
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
							title="Git & GitHub"
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

						{/* Dynamic Tools Tab */}
						<button
							type="button"
							className={`workspace-mobile-nav__tab workspace-mobile-nav__tab--tools${isToolActiveMobile ? ' is-active' : ''}`}
							onClick={() => setToolsMenuOpen(true)}
							title="Tools"
						>
							{activeView === 'editor' ? (
								<IconCode className="workspace-mobile-nav__icon" />
							) : activeView === 'terminal' ? (
								<IconTerminal className="workspace-mobile-nav__icon" />
							) : activeView === 'artifacts' ? (
								<IconArtifact className="workspace-mobile-nav__icon" />
							) : activeView === 'processes' ? (
								<IconProcess className="workspace-mobile-nav__icon" />
							) : activeView === 'problems' ? (
								<IconProblem className="workspace-mobile-nav__icon" />
							) : activeView === 'plans' ? (
								<IconPlan className="workspace-mobile-nav__icon" />
							) : activeView === 'browser' ? (
								<IconBrowser className="workspace-mobile-nav__icon" />
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
									: activeView === 'processes'
									? 'Servers'
									: activeView === 'problems'
									? 'Problems'
									: activeView === 'plans'
									? 'Plans'
									: activeView === 'browser'
									? 'Browser'
									: 'Tools'}
							</span>
							{!isToolActiveMobile && problemsSummary && problemsSummary.active > 0 && (
								<span
									className={`workspace-mobile-nav__badge${problemsSummary.errors > 0 ? ' workspace-mobile-nav__badge--error' : ''}`}
								>
									{problemsSummary.active}
								</span>
							)}
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
										{rightTool === 'processes' && (
											<button
												type="button"
												role="tab"
												aria-selected={true}
												className="tool-switcher-tab is-active"
												onClick={() => setRightTool('processes')}
											>
												<IconProcess className="tool-switcher-tab__icon" />
												<span>Servers</span>
											</button>
										)}
										{rightTool === 'problems' && (
											<button
												type="button"
												role="tab"
												aria-selected={true}
												className="tool-switcher-tab is-active"
												onClick={() => setRightTool('problems')}
											>
												<IconProblem className="tool-switcher-tab__icon" />
												<span>Problems</span>
												{problemsSummary && problemsSummary.active > 0 && (
													<span className="tool-switcher-tab__badge">
														{problemsSummary.active}
													</span>
												)}
											</button>
										)}
										{rightTool === 'plans' && (
											<button
												type="button"
												role="tab"
												aria-selected={true}
												className="tool-switcher-tab is-active"
												onClick={() => setRightTool('plans')}
											>
												<IconPlan className="tool-switcher-tab__icon" />
												<span>Plans</span>
											</button>
										)}
										{rightTool === 'browser' && (
											<button
												type="button"
												role="tab"
												aria-selected={true}
												className="tool-switcher-tab is-active"
												onClick={() => setRightTool('browser')}
											>
												<IconBrowser className="tool-switcher-tab__icon" />
												<span>Browser</span>
											</button>
										)}

										{/* Tools '…' Popup Trigger */}
										<button
											type="button"
											className="tool-switcher-tab tool-switcher-tab--more"
											onClick={() => setToolsMenuOpen(true)}
											title="More tools"
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
									{rightTool === 'processes' && (
										<ProcessesView
											project={project}
											onOpenInTerminal={handleOpenInTerminal}
											onNavigateToTerminal={() => setRightTool('terminal')}
											onOpenInBrowser={handleOpenInBrowser}
										/>
									)}
									{rightTool === 'problems' && (
										<ProblemsView
											project={project}
											onOpenInEditor={handleOpenInEditor}
											onSendToChat={handleSendToChat}
											onNavigateToChat={() => onNavigate('agent')}
											onNavigateToChanges={() => setRightTool('changes')}
											onNavigateToRepo={() => setRightTool('repo')}
										/>
									)}
									{rightTool === 'plans' && (
										<PlansView
											project={project}
											onSendToChat={handleSendToChat}
											onNavigateToChat={() => onNavigate('agent')}
											onOpenInEditor={handleOpenInEditor}
											onOpenInTerminal={() => setRightTool('terminal')}
											onOpenArtifact={handleOpenArtifact}
											onOpenProblem={handleOpenProblem}
										/>
									)}
									{rightTool === 'browser' && (
										<BrowserView
											project={project}
											isWide={true}
											isMaximized={splitPercent <= 26}
											onToggleMaximize={() => setSplitPercent(splitPercent <= 26 ? 50 : 25)}
											onSendToChat={handleSendToChat}
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
							{activeView === 'processes' && (
								<ProcessesView
									project={project}
									onOpenInTerminal={handleOpenInTerminal}
									onNavigateToTerminal={() => onNavigate('terminal')}
									onOpenInBrowser={handleOpenInBrowser}
								/>
							)}
							{activeView === 'problems' && (
								<ProblemsView
									project={project}
									onOpenInEditor={handleOpenInEditor}
									onSendToChat={handleSendToChat}
									onNavigateToChat={() => onNavigate('agent')}
									onNavigateToChanges={() => onNavigate('changes')}
									onNavigateToRepo={() => onNavigate('repo')}
								/>
							)}
							{activeView === 'plans' && (
								<PlansView
									project={project}
									onSendToChat={handleSendToChat}
									onNavigateToChat={() => onNavigate('agent')}
									onOpenInEditor={handleOpenInEditor}
									onOpenInTerminal={() => onNavigate('terminal')}
									onOpenArtifact={handleOpenArtifact}
									onOpenProblem={handleOpenProblem}
								/>
							)}
							{activeView === 'browser' && (
								<BrowserView
									project={project}
									isWide={false}
									onSendToChat={(text) => {
										handleSendToChat(text)
										onNavigate('agent')
									}}
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
							? isExtendedTool(rightTool)
								? rightTool
								: null
							: isExtendedTool(activeView)
							? activeView
							: null
					}
					problemsCount={problemsSummary?.active}
					problemsErrors={problemsSummary?.errors}
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
