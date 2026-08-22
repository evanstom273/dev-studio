import { useCallback, useEffect, useState } from 'react'
import type { Project } from '@shared/types/project'
import type { TerminalSessionInfo } from '@shared/types/terminal'
import {
	IconClose,
	IconPlus,
	IconRefresh,
	IconTerminal,
} from '../components/Icons'
import { TerminalPane } from '../components/terminal/TerminalPane'
import { terminalApi } from '../services/terminalApi'
import '../styles/terminal.css'

type TerminalViewProps = {
	project: Project
}

export function TerminalView({ project }: TerminalViewProps) {
	const [sessions, setSessions] = useState<TerminalSessionInfo[]>([])
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	// Rename session modal
	const [renameModalOpen, setRenameModalOpen] = useState(false)
	const [renameTitleInput, setRenameTitleInput] = useState('')
	const [renameTargetId, setRenameTargetId] = useState<string | null>(null)

	const loadSessions = useCallback(async () => {
		try {
			const list = await terminalApi.listSessions(project.id)
			if (list.length > 0) {
				setSessions(list)
				if (!activeSessionId || !list.some((s) => s.id === activeSessionId)) {
					setActiveSessionId(list[0].id)
				}
			} else {
				// Create initial default session
				const def = await terminalApi.getDefaultSession(project.id)
				setSessions([def])
				setActiveSessionId(def.id)
			}
			setError(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to connect to terminal worker')
		} finally {
			setLoading(false)
		}
	}, [activeSessionId, project.id])

	useEffect(() => {
		void loadSessions()
	}, [loadSessions])

	const handleCreateSession = async () => {
		try {
			const newSession = await terminalApi.createSession(project.id, {
				title: `Terminal ${sessions.length + 1}`,
			})
			setSessions((prev) => [...prev, newSession])
			setActiveSessionId(newSession.id)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create terminal session')
		}
	}

	const handleKillSession = async (sessionId: string) => {
		if (sessions.length <= 1) {
			// Don't kill the last session without spawning a new one
			if (!confirm('Close this terminal and start a new one?')) return
		}

		try {
			await terminalApi.killSession(project.id, sessionId)
			setSessions((prev) => {
				const filtered = prev.filter((s) => s.id !== sessionId)
				if (activeSessionId === sessionId) {
					const next = filtered[filtered.length - 1]
					setActiveSessionId(next ? next.id : null)
				}
				return filtered
			})

			if (sessions.length <= 1) {
				const fresh = await terminalApi.createSession(project.id)
				setSessions([fresh])
				setActiveSessionId(fresh.id)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to close terminal')
		}
	}

	const handleStartRename = (session: TerminalSessionInfo) => {
		setRenameTargetId(session.id)
		setRenameTitleInput(session.title)
		setRenameModalOpen(true)
	}

	const handleSaveRename = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!renameTargetId || !renameTitleInput.trim()) return

		try {
			const updated = await terminalApi.renameSession(
				project.id,
				renameTargetId,
				renameTitleInput.trim(),
			)
			setSessions((prev) =>
				prev.map((s) => (s.id === renameTargetId ? { ...s, title: updated.title } : s)),
			)
			setRenameModalOpen(false)
			setRenameTargetId(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to rename session')
		}
	}

	const activeSession = sessions.find((s) => s.id === activeSessionId)

	return (
		<div className="terminal-view">
			{/* Top Bar with Tabs and CWD info */}
			<div className="terminal-view__header">
				<div className="terminal-tabs" role="tablist" aria-label="Terminal sessions">
					<div className="terminal-tabs__list">
						{sessions.map((s) => {
							const isActive = s.id === activeSessionId
							return (
								<div
									key={s.id}
									className={`terminal-tab${isActive ? ' is-active' : ''}`}
									role="tab"
									aria-selected={isActive}
									onClick={() => setActiveSessionId(s.id)}
									onDoubleClick={() => handleStartRename(s)}
									title="Double click to rename"
								>
									<IconTerminal className="terminal-tab__icon" />
									<span className="terminal-tab__title">{s.title}</span>
									<button
										type="button"
										className="terminal-tab__close"
										onClick={(e) => {
											e.stopPropagation()
											void handleKillSession(s.id)
										}}
										aria-label={`Close ${s.title}`}
										title="Close session"
									>
										<IconClose className="terminal-tab__close-icon" />
									</button>
								</div>
							)
						})}
					</div>

					<button
						type="button"
						className="terminal-tabs__add-btn"
						onClick={() => void handleCreateSession()}
						title="New Terminal session"
						aria-label="New Terminal"
					>
						<IconPlus className="terminal-tabs__add-icon" />
					</button>
				</div>

				<div className="terminal-view__meta">
					{activeSession && (
						<span className="terminal-view__cwd" title={activeSession.cwd}>
							{project.name}
						</span>
					)}
					<button
						type="button"
						className="terminal-btn-icon"
						onClick={() => void loadSessions()}
						title="Reconnect / Refresh sessions"
						aria-label="Refresh"
					>
						<IconRefresh className="terminal-btn-icon__svg" />
					</button>
				</div>
			</div>

			{error && <div className="terminal-view__error">{error}</div>}

			{/* Main Terminal Container */}
			<div className="terminal-view__body">
				{loading ? (
					<div className="terminal-loading">
						<div className="spinner" />
						<span>Connecting to laptop worker...</span>
					</div>
				) : sessions.length === 0 ? (
					<div className="terminal-empty">
						<IconTerminal className="terminal-empty__icon" />
						<p>No active terminal sessions</p>
						<button
							type="button"
							className="editor-btn editor-btn--primary"
							onClick={() => void handleCreateSession()}
						>
							Start Terminal
						</button>
					</div>
				) : (
					sessions.map((session) => (
						<TerminalPane
							key={session.id}
							sessionId={session.id}
							isActive={session.id === activeSessionId}
						/>
					))
				)}
			</div>

			{/* Rename Modal */}
			{renameModalOpen && (
				<div className="editor-modal-overlay">
					<form className="editor-modal editor-modal--small" onSubmit={handleSaveRename}>
						<div className="editor-modal__header">
							<span className="editor-modal__title">Rename Terminal</span>
							<button
								type="button"
								className="editor-modal__close"
								onClick={() => setRenameModalOpen(false)}
							>
								<IconClose className="editor-modal__close-icon" />
							</button>
						</div>
						<div className="editor-modal__body">
							<input
								type="text"
								className="editor-modal__input"
								placeholder="Terminal name (e.g. dev server)..."
								value={renameTitleInput}
								onChange={(e) => setRenameTitleInput(e.target.value)}
								autoFocus
							/>
						</div>
						<div className="editor-modal__footer">
							<button
								type="button"
								className="editor-btn editor-btn--secondary"
								onClick={() => setRenameModalOpen(false)}
							>
								Cancel
							</button>
							<button type="submit" className="editor-btn editor-btn--primary">
								Save
							</button>
						</div>
					</form>
				</div>
			)}
		</div>
	)
}
