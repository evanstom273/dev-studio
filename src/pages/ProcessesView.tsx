import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Project } from '@shared/types/project'
import type { DevProcess } from '@shared/types/process'
import {
	IconBrowser,
	IconCopy,
	IconKill,
	IconPlay,
	IconPlus,
	IconProcess,
	IconRefresh,
	IconSearch,
	IconServer,
	IconShield,
	IconTerminal,
} from '../components/Icons'
import { processApi } from '../services/processApi'
import '../styles/processes.css'

type ProcessesViewProps = {
	project: Project
	onOpenInTerminal?: (sessionId: string) => void
	onNavigateToTerminal?: () => void
	onOpenInBrowser?: (url: string) => void
}

function formatBytes(bytes?: number): string {
	if (!bytes || bytes <= 0) return '—'
	const mb = bytes / (1024 * 1024)
	if (mb < 1) return `${Math.round(bytes / 1024)} KB`
	if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`
	return `${Math.round(mb)} MB`
}

function formatUptime(seconds?: number): string {
	if (!seconds || seconds <= 0) return 'Just now'
	if (seconds < 60) return `${seconds}s`
	const mins = Math.floor(seconds / 60)
	if (mins < 60) return `${mins}m`
	const hours = Math.floor(mins / 60)
	const remMins = mins % 60
	return `${hours}h ${remMins}m`
}

const QUICK_COMMANDS = [
	{ label: 'npm run dev', command: 'npm run dev' },
	{ label: 'npm test', command: 'npm test' },
	{ label: 'npm run build', command: 'npm run build' },
	{ label: 'npm run lint', command: 'npm run lint' },
]

export function ProcessesView({
	project,
	onOpenInTerminal,
	onOpenInBrowser,
}: ProcessesViewProps) {
	const [processes, setProcesses] = useState<DevProcess[]>([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [showAll, setShowAll] = useState(false)
	const [searchQuery, setSearchQuery] = useState('')

	// Copy feedback state
	const [copiedPid, setCopiedPid] = useState<number | null>(null)
	const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
	const [copiedCmd, setCopiedCmd] = useState<number | null>(null)

	// Modals
	const [startModalOpen, setStartModalOpen] = useState(false)
	const [newCommand, setNewCommand] = useState('npm run dev')
	const [newTitle, setNewTitle] = useState('')
	const [starting, setStarting] = useState(false)

	// Kill confirmation modal
	const [killTarget, setKillTarget] = useState<DevProcess | null>(null)
	const [backendAckChecked, setBackendAckChecked] = useState(false)
	const [killing, setKilling] = useState(false)

	const loadProcesses = useCallback(
		async (isRefresh = false) => {
			if (isRefresh) setRefreshing(true)
			else setLoading(true)
			setError(null)
			try {
				const res = await processApi.list(project.id, showAll)
				setProcesses(res.processes)
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load processes')
			} finally {
				setLoading(false)
				setRefreshing(false)
			}
		},
		[project.id, showAll],
	)

	useEffect(() => {
		void loadProcesses()
		const interval = setInterval(() => {
			void loadProcesses(true)
		}, 10000)
		return () => clearInterval(interval)
	}, [loadProcesses])

	const filteredProcesses = useMemo(() => {
		if (!searchQuery.trim()) return processes
		const q = searchQuery.toLowerCase().trim()
		return processes.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				p.command.toLowerCase().includes(q) ||
				p.pid.toString().includes(q) ||
				p.ports.some((port) => port.port.toString().includes(q) || port.url?.includes(q)),
		)
	}, [processes, searchQuery])

	// Filter out listening dev servers for the top section
	const listeningServers = useMemo(() => {
		return filteredProcesses.filter((p) => p.ports.length > 0)
	}, [filteredProcesses])

	const handleCopyUrl = async (url: string) => {
		try {
			await navigator.clipboard.writeText(url)
			setCopiedUrl(url)
			setTimeout(() => setCopiedUrl(null), 2000)
		} catch {
			// ignore copy error
		}
	}

	const handleCopyPid = async (pid: number) => {
		try {
			await navigator.clipboard.writeText(pid.toString())
			setCopiedPid(pid)
			setTimeout(() => setCopiedPid(null), 2000)
		} catch {
			// ignore
		}
	}

	const handleCopyCmd = async (pid: number, cmd: string) => {
		try {
			await navigator.clipboard.writeText(cmd)
			setCopiedCmd(pid)
			setTimeout(() => setCopiedCmd(null), 2000)
		} catch {
			// ignore
		}
	}

	const handleStartProcess = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newCommand.trim() || starting) return
		setStarting(true)
		setError(null)
		try {
			await processApi.start(project.id, {
				command: newCommand.trim(),
				title: newTitle.trim() || undefined,
			})
			setStartModalOpen(false)
			setNewCommand('npm run dev')
			setNewTitle('')
			await loadProcesses(true)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to start process')
		} finally {
			setStarting(false)
		}
	}

	const handleConfirmKill = async () => {
		if (!killTarget || killing) return
		setKilling(true)
		setError(null)
		try {
			const res = await processApi.kill(project.id, killTarget.pid, {
				acknowledgeBackend: killTarget.isDevStudioBackend ? backendAckChecked : undefined,
			})
			if (!res.success) {
				setError(res.message || 'Failed to stop process')
			} else {
				setKillTarget(null)
				setBackendAckChecked(false)
				await loadProcesses(true)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to stop process')
		} finally {
			setKilling(false)
		}
	}

	const handleRestart = async (p: DevProcess) => {
		if (p.isDevStudioBackend) return
		setError(null)
		try {
			await processApi.restart(project.id, p.pid)
			await loadProcesses(true)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to restart process')
		}
	}

	return (
		<div className="processes-view">
			{/* Header */}
			<div className="processes-header">
				<div className="processes-header__titles">
					<div className="processes-header__title">
						<IconProcess className="processes-btn-icon" />
						<span>Processes & Servers</span>
					</div>
					<span className="processes-header__desc">
						Inspect and manage local development servers, listening ports & background processes
					</span>
				</div>

				<div className="processes-header__actions">
					<button
						type="button"
						className="processes-btn"
						onClick={() => void loadProcesses(true)}
						disabled={refreshing}
						title="Refresh processes"
					>
						<IconRefresh
							className={`processes-btn-icon${refreshing ? ' processes-spin' : ''}`}
						/>
						<span>Refresh</span>
					</button>

					<button
						type="button"
						className="processes-btn processes-btn--primary"
						onClick={() => setStartModalOpen(true)}
						title="Start a new command or dev server"
					>
						<IconPlus className="processes-btn-icon" />
						<span>Start Process</span>
					</button>
				</div>
			</div>

			{/* Filter Toolbar */}
			<div className="processes-toolbar">
				<div className="processes-search">
					<IconSearch className="processes-btn-icon" />
					<input
						type="text"
						placeholder="Search by name, port, command or PID..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>

				<div className="processes-toggle-group">
					<button
						type="button"
						className={`processes-toggle-btn${!showAll ? ' is-active' : ''}`}
						onClick={() => setShowAll(false)}
					>
						Project Processes
					</button>
					<button
						type="button"
						className={`processes-toggle-btn${showAll ? ' is-active' : ''}`}
						onClick={() => setShowAll(true)}
					>
						All Discovered
					</button>
				</div>
			</div>

			{/* Content Area */}
			<div className="processes-content">
				{error && (
					<div className="process-backend-warning" role="alert">
						<IconShield className="processes-btn-icon" />
						<span>{error}</span>
					</div>
				)}

				{loading && processes.length === 0 ? (
					<div className="processes-empty">
						<IconRefresh className="processes-btn-icon processes-spin" />
						<span>Scanning running development processes & network ports...</span>
					</div>
				) : filteredProcesses.length === 0 ? (
					<div className="processes-empty">
						<IconProcess className="processes-btn-icon" />
						<span>No matching processes found. Click "Start Process" to launch one.</span>
					</div>
				) : (
					<>
						{/* Detected Dev Servers Section */}
						{listeningServers.length > 0 && (
							<div>
								<div className="processes-section-title">
									<IconServer className="processes-btn-icon" />
									<span>Detected Servers & Ports ({listeningServers.length})</span>
								</div>

								<div className="servers-grid">
									{listeningServers.map((server) => {
										const primaryUrl = server.detectedUrl || (server.ports[0] ? `http://localhost:${server.ports[0].port}` : '')
										const isCopied = copiedUrl === primaryUrl

										return (
											<div key={`srv-${server.pid}`} className="server-card">
												<div className="server-card__header">
													<span className="server-card__name">{server.name}</span>
													<span className="process-badge process-badge--server">
														Listening :{server.ports.map((p) => p.port).join(', :')}
													</span>
												</div>

												{primaryUrl && (
													<div className="server-card__url">{primaryUrl}</div>
												)}

												<div className="server-card__meta">
													<span>PID {server.pid}</span>
													<span>•</span>
													<span>{formatUptime(server.uptimeSeconds)} uptime</span>
													{server.memoryBytes ? (
														<>
															<span>•</span>
															<span>{formatBytes(server.memoryBytes)}</span>
														</>
													) : null}
												</div>

												<div className="server-card__actions">
													{primaryUrl && (
														<button
															type="button"
															className="processes-btn processes-btn--sm"
															onClick={() => handleCopyUrl(primaryUrl)}
														>
															<IconCopy className="processes-btn-icon" />
															<span>{isCopied ? 'Copied!' : 'Copy URL'}</span>
														</button>
													)}

													{primaryUrl && onOpenInBrowser && (
														<button
															type="button"
															className="processes-btn processes-btn--sm"
															onClick={() => onOpenInBrowser(primaryUrl)}
														>
															<IconBrowser className="processes-btn-icon" />
															<span>Open in Browser</span>
														</button>
													)}

													{server.terminalSessionId && onOpenInTerminal && (
														<button
															type="button"
															className="processes-btn processes-btn--sm"
															onClick={() => onOpenInTerminal(server.terminalSessionId!)}
														>
															<IconTerminal className="processes-btn-icon" />
															<span>View Terminal</span>
														</button>
													)}
												</div>
											</div>
										)
									})}
								</div>
							</div>
						)}

						{/* All Development Processes Section */}
						<div>
							<div className="processes-section-title">
								<IconProcess className="processes-btn-icon" />
								<span>Running Processes ({filteredProcesses.length})</span>
							</div>

							<div className="process-list">
								{filteredProcesses.map((proc) => {
									const isCopiedPid = copiedPid === proc.pid
									const isCopiedCmd = copiedCmd === proc.pid

									return (
										<div
											key={`proc-${proc.pid}`}
											className={`process-card${proc.isDevStudioBackend ? ' process-card--backend' : ''}`}
										>
											<div className="process-card__header">
												<div className="process-card__identity">
													{proc.isDevStudioBackend && (
														<IconShield className="processes-btn-icon" style={{ color: 'var(--accent)' }} />
													)}
													<span className="process-card__name">{proc.name}</span>

													{proc.isDevStudioBackend ? (
														<span className="process-badge process-badge--backend">
															🛡️ Dev Studio Backend
														</span>
													) : proc.category === 'dev-server' ? (
														<span className="process-badge process-badge--server">
															Dev Server
														</span>
													) : proc.category === 'terminal' ? (
														<span className="process-badge process-badge--terminal">
															Terminal
														</span>
													) : proc.category === 'build-watcher' ? (
														<span className="process-badge process-badge--watcher">
															Watcher
														</span>
													) : (
														<span className="process-badge">{proc.category}</span>
													)}

													{proc.ports.length > 0 && (
														<span className="process-badge process-badge--server">
															:{proc.ports.map((p) => p.port).join(', :')}
														</span>
													)}
												</div>

												<div className="process-card__controls">
													{proc.terminalSessionId && onOpenInTerminal ? (
														<button
															type="button"
															className="processes-btn processes-btn--sm"
															onClick={() => onOpenInTerminal(proc.terminalSessionId!)}
															title="Open associated terminal session"
														>
															<IconTerminal className="processes-btn-icon" />
															<span>Terminal</span>
														</button>
													) : null}

													{!proc.isDevStudioBackend && (
														<button
															type="button"
															className="processes-btn processes-btn--sm"
															onClick={() => void handleRestart(proc)}
															title="Restart process"
														>
															<IconRefresh className="processes-btn-icon" />
															<span>Restart</span>
														</button>
													)}

													<button
														type="button"
														className={`processes-btn processes-btn--sm${proc.isDevStudioBackend ? '' : ' processes-btn--danger'}`}
														onClick={() => {
															setKillTarget(proc)
															setBackendAckChecked(false)
														}}
														title={proc.isDevStudioBackend ? 'Dev Studio Backend process' : 'Terminate process'}
													>
														<IconKill className="processes-btn-icon" />
														<span>{proc.isDevStudioBackend ? 'Stop Backend…' : 'Kill'}</span>
													</button>
												</div>
											</div>

											{/* Command Line */}
											<div
												className="process-card__command"
												onClick={() => handleCopyCmd(proc.pid, proc.command)}
												title="Click to copy full command line"
											>
												{isCopiedCmd ? '✓ Copied command line!' : proc.command}
											</div>

											{/* Backend Protection Notice */}
											{proc.isDevStudioBackend && (
												<div className="process-backend-warning">
													<IconShield className="processes-btn-icon" />
													<span>
														Dev Studio Backend process. Stop controls require explicit remote confirmation.
													</span>
												</div>
											)}

											{/* Footer Info */}
											<div className="process-card__footer">
												<div className="process-card__details">
													<button
														type="button"
														className="processes-btn processes-btn--sm"
														onClick={() => handleCopyPid(proc.pid)}
														title="Click to copy PID"
													>
														<IconCopy className="processes-btn-icon" />
														<span>{isCopiedPid ? 'Copied PID!' : `PID ${proc.pid}`}</span>
													</button>

													<span>•</span>
													<span>{formatUptime(proc.uptimeSeconds)} uptime</span>

													{proc.memoryBytes ? (
														<>
															<span>•</span>
															<span>{formatBytes(proc.memoryBytes)}</span>
														</>
													) : null}

													{proc.cwd ? (
														<>
															<span>•</span>
															<span title={proc.cwd}>
																CWD: {proc.cwd.split(/[/\\]/).slice(-2).join('/')}
															</span>
														</>
													) : null}
												</div>

												<div>
													<span className="process-badge">{proc.source}</span>
												</div>
											</div>
										</div>
									)
								})}
							</div>
						</div>
					</>
				)}
			</div>

			{/* Start Process Modal */}
			{startModalOpen && (
				<div
					className="processes-modal-backdrop"
					onClick={() => !starting && setStartModalOpen(false)}
				>
					<div className="processes-modal" onClick={(e) => e.stopPropagation()}>
						<div className="processes-modal__title">Start Development Process</div>
						<form onSubmit={handleStartProcess} className="processes-modal__body">
							<div>
								<label
									style={{
										fontSize: '11px',
										color: 'var(--text-secondary)',
										marginBottom: '4px',
										display: 'block',
									}}
								>
									Process Title (optional)
								</label>
								<input
									type="text"
									className="processes-modal__input"
									placeholder="e.g. Vite Dev Server"
									value={newTitle}
									onChange={(e) => setNewTitle(e.target.value)}
									disabled={starting}
								/>
							</div>

							<div>
								<label
									style={{
										fontSize: '11px',
										color: 'var(--text-secondary)',
										marginBottom: '4px',
										display: 'block',
									}}
								>
									Command Line
								</label>
								<input
									type="text"
									className="processes-modal__input"
									placeholder="e.g. npm run dev"
									value={newCommand}
									onChange={(e) => setNewCommand(e.target.value)}
									disabled={starting}
									required
									autoFocus
								/>
							</div>

							<div>
								<span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
									Quick templates:
								</span>
								<div className="processes-quick-templates">
									{QUICK_COMMANDS.map((qc) => (
										<button
											key={qc.command}
											type="button"
											className="processes-template-chip"
											onClick={() => {
												setNewCommand(qc.command)
												setNewTitle(qc.label)
											}}
										>
											{qc.label}
										</button>
									))}
								</div>
							</div>

							<div className="processes-modal__footer">
								<button
									type="button"
									className="processes-btn"
									onClick={() => setStartModalOpen(false)}
									disabled={starting}
								>
									Cancel
								</button>
								<button
									type="submit"
									className="processes-btn processes-btn--primary"
									disabled={starting || !newCommand.trim()}
								>
									<IconPlay className="processes-btn-icon" />
									<span>{starting ? 'Starting...' : 'Start in Terminal'}</span>
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Kill / Stop Confirmation Modal */}
			{killTarget && (
				<div
					className="processes-modal-backdrop"
					onClick={() => !killing && setKillTarget(null)}
				>
					<div className="processes-modal" onClick={(e) => e.stopPropagation()}>
						<div className="processes-modal__title">
							{killTarget.isDevStudioBackend ? '⚠️ Dev Studio Backend Protection' : 'Confirm Process Termination'}
						</div>

						<div className="processes-modal__body">
							{killTarget.isDevStudioBackend ? (
								<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
									<div className="process-backend-warning" style={{ padding: '10px' }}>
										<IconShield style={{ width: '20px', height: '20px', flexShrink: 0 }} />
										<span>
											<strong>CRITICAL WARNING:</strong> Stopping this process will disconnect Dev Studio and cannot currently be recovered remotely unless an external supervisor restarts it.
										</span>
									</div>

									<label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
										<input
											type="checkbox"
											checked={backendAckChecked}
											onChange={(e) => setBackendAckChecked(e.target.checked)}
											style={{ marginTop: '2px' }}
										/>
										<span>I understand that stopping the backend will terminate my remote connection immediately.</span>
									</label>
								</div>
							) : (
								<p>
									Are you sure you want to terminate <strong>{killTarget.name}</strong> (PID {killTarget.pid})?
								</p>
							)}
						</div>

						<div className="processes-modal__footer">
							<button
								type="button"
								className="processes-btn"
								onClick={() => setKillTarget(null)}
								disabled={killing}
							>
								Cancel
							</button>

							<button
								type="button"
								className="processes-btn processes-btn--danger"
								onClick={handleConfirmKill}
								disabled={killing || (killTarget.isDevStudioBackend && !backendAckChecked)}
							>
								<IconKill className="processes-btn-icon" />
								<span>{killing ? 'Stopping...' : killTarget.isDevStudioBackend ? 'Terminate Backend' : 'Kill Process'}</span>
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

