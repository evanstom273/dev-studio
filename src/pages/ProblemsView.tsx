import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Project } from '@shared/types/project'
import type { Problem, ProblemFilter, ProblemSeverity, ProblemSummary } from '@shared/types/problem'
import {
	IconAgent,
	IconAlertCircle,
	IconAlertTriangle,
	IconChanges,
	IconCheckCircle,
	IconCode,
	IconFile,
	IconInfo,
	IconProblem,
	IconRefresh,
	IconRepo,
	IconSearch,
	IconTrash,
} from '../components/Icons'
import { problemApi } from '../services/problemApi'
import '../styles/problems.css'

type ProblemsViewProps = {
	project: Project
	onOpenInEditor?: (filePath: string, line?: number, col?: number) => void
	onSendToChat?: (contextText: string) => void
	onNavigateToChat?: () => void
	onNavigateToChanges?: () => void
	onNavigateToRepo?: () => void
}

export function ProblemsView({
	project,
	onOpenInEditor,
	onSendToChat,
	onNavigateToChat,
	onNavigateToChanges,
	onNavigateToRepo,
}: ProblemsViewProps) {
	const [problems, setProblems] = useState<Problem[]>([])
	const [summary, setSummary] = useState<ProblemSummary>({
		total: 0,
		errors: 0,
		warnings: 0,
		info: 0,
		active: 0,
		resolved: 0,
	})
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Filter state
	const [statusFilter, setStatusFilter] = useState<'active' | 'resolved' | 'all'>('active')
	const [severityFilter, setSeverityFilter] = useState<ProblemSeverity | 'all'>('all')
	const [sourceFilter, setSourceFilter] = useState<string>('all')
	const [searchQuery, setSearchQuery] = useState('')

	const loadProblems = useCallback(
		async (isRefresh = false) => {
			if (isRefresh) setRefreshing(true)
			else setLoading(true)
			setError(null)
			try {
				const filter: ProblemFilter = {
					status: statusFilter,
					severity: severityFilter,
					source: sourceFilter,
					search: searchQuery,
				}
				const [list, sum] = await Promise.all([
					problemApi.list(project.id, filter),
					problemApi.getSummary(project.id),
				])
				setProblems(list)
				setSummary(sum)
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load problems')
			} finally {
				setLoading(false)
				setRefreshing(false)
			}
		},
		[project.id, statusFilter, severityFilter, sourceFilter, searchQuery],
	)

	useEffect(() => {
		void loadProblems()
	}, [loadProblems])

	const handleRefreshDiagnostics = async () => {
		setRefreshing(true)
		setError(null)
		try {
			const refreshedList = await problemApi.refresh(project.id)
			const sum = await problemApi.getSummary(project.id)
			setProblems(refreshedList)
			setSummary(sum)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Diagnostic refresh failed')
		} finally {
			setRefreshing(false)
		}
	}

	const handleResolve = async (problemId: string) => {
		try {
			await problemApi.resolve(project.id, problemId)
			await loadProblems()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to resolve problem')
		}
	}

	const handleReopen = async (problemId: string) => {
		try {
			await problemApi.reopen(project.id, problemId)
			await loadProblems()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to reopen problem')
		}
	}

	const handleDelete = async (problemId: string) => {
		try {
			await problemApi.delete(project.id, problemId)
			await loadProblems()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete problem')
		}
	}

	const handleClearResolved = async () => {
		try {
			await problemApi.clearResolved(project.id)
			await loadProblems()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to clear resolved problems')
		}
	}

	const handleFixWithAgent = (p: Problem) => {
		const context = [
			`[PROBLEM DIAGNOSTIC]`,
			`Source: ${p.source} (${p.category})`,
			`Severity: ${p.severity.toUpperCase()}`,
			p.file ? `File: ${p.file}${p.line ? `:${p.line}${p.column ? `:${p.column}` : ''}` : ''}` : null,
			`Title: ${p.title}`,
			`Message: ${p.message}`,
			p.command ? `Command: ${p.command}` : null,
			p.gitBranch ? `Git Branch: ${p.gitBranch}` : null,
			p.pullRequestNumber ? `Pull Request: #${p.pullRequestNumber}` : null,
			'',
			`Please investigate this issue and propose or implement the fix.`,
		]
			.filter(Boolean)
			.join('\n')

		if (onSendToChat) {
			onSendToChat(context)
		}
		if (onNavigateToChat) {
			onNavigateToChat()
		}
	}

	const uniqueSources = useMemo(() => {
		const sources = new Set(problems.map((p) => p.source))
		return Array.from(sources)
	}, [problems])

	return (
		<div className="problems-view">
			{/* Header */}
			<div className="problems-header">
				<div className="problems-header__titles">
					<div className="problems-header__title">
						<IconProblem className="problems-btn-icon" />
						<span>Problems & Diagnostics</span>
					</div>
					<span className="problems-header__desc">
						Actionable compiler errors, lints, merge conflicts & GitHub checks
					</span>
				</div>

				<div className="problems-header__actions">
					{summary.resolved > 0 && (
						<button
							type="button"
							className="problems-btn problems-btn--sm"
							onClick={handleClearResolved}
							title="Clear resolved problems"
						>
							<IconTrash className="problems-btn-icon" />
							<span>Clear Resolved</span>
						</button>
					)}

					<button
						type="button"
						className="problems-btn problems-btn--primary"
						onClick={handleRefreshDiagnostics}
						disabled={refreshing}
						title="Run diagnostics and re-check conflicts/checks"
					>
						<IconRefresh
							className={`problems-btn-icon${refreshing ? ' processes-spin' : ''}`}
						/>
						<span>Run Diagnostics</span>
					</button>
				</div>
			</div>

			{/* Summary Bar */}
			<div className="problems-summary-bar">
				<div className="problems-stat problems-stat--errors">
					<IconAlertCircle className="problems-btn-icon" />
					<span>Errors:</span>
					<span className="problems-stat__badge">{summary.errors}</span>
				</div>

				<div className="problems-stat problems-stat--warnings">
					<IconAlertTriangle className="problems-btn-icon" />
					<span>Warnings:</span>
					<span className="problems-stat__badge">{summary.warnings}</span>
				</div>

				<div className="problems-stat problems-stat--info">
					<IconInfo className="problems-btn-icon" />
					<span>Info:</span>
					<span className="problems-stat__badge">{summary.info}</span>
				</div>

				<div className="problems-stat problems-stat--resolved">
					<IconCheckCircle className="problems-btn-icon" />
					<span>Resolved:</span>
					<span className="problems-stat__badge">{summary.resolved}</span>
				</div>
			</div>

			{/* Filters Bar */}
			<div className="problems-filters-bar">
				<div className="problems-filter-controls">
					<div className="processes-toggle-group">
						<button
							type="button"
							className={`processes-toggle-btn${statusFilter === 'active' ? ' is-active' : ''}`}
							onClick={() => setStatusFilter('active')}
						>
							Active ({summary.active})
						</button>
						<button
							type="button"
							className={`processes-toggle-btn${statusFilter === 'resolved' ? ' is-active' : ''}`}
							onClick={() => setStatusFilter('resolved')}
						>
							Resolved ({summary.resolved})
						</button>
						<button
							type="button"
							className={`processes-toggle-btn${statusFilter === 'all' ? ' is-active' : ''}`}
							onClick={() => setStatusFilter('all')}
						>
							All ({summary.total})
						</button>
					</div>

					<select
						className="problems-select"
						value={severityFilter}
						onChange={(e) => setSeverityFilter(e.target.value as ProblemSeverity | 'all')}
					>
						<option value="all">All Severities</option>
						<option value="error">Errors Only</option>
						<option value="warning">Warnings Only</option>
						<option value="info">Info Only</option>
					</select>

					{uniqueSources.length > 0 && (
						<select
							className="problems-select"
							value={sourceFilter}
							onChange={(e) => setSourceFilter(e.target.value)}
						>
							<option value="all">All Sources</option>
							{uniqueSources.map((src) => (
								<option key={src} value={src}>
									{src}
								</option>
							))}
						</select>
					)}
				</div>

				<div className="problems-search">
					<IconSearch className="problems-btn-icon" />
					<input
						type="text"
						placeholder="Search in title, message, file..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>
			</div>

			{/* Content */}
			<div className="problems-content">
				{error && (
					<div className="process-backend-warning" role="alert">
						<IconAlertTriangle className="problems-btn-icon" />
						<span>{error}</span>
					</div>
				)}

				{loading && problems.length === 0 ? (
					<div className="problems-empty">
						<IconRefresh className="problems-btn-icon processes-spin" />
						<span>Scanning for project diagnostics and repository problems...</span>
					</div>
				) : problems.length === 0 ? (
					<div className="problems-empty">
						<IconCheckCircle
							className="problems-btn-icon"
							style={{ width: '28px', height: '28px', color: '#10b981' }}
						/>
						<span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
							No active problems
						</span>
						<span>All compiler diagnostics, merge checks and workflows are passing.</span>
					</div>
				) : (
					problems.map((p) => {
						const isError = p.severity === 'error'
						const isWarning = p.severity === 'warning'
						const isConflict = p.source === 'merge_conflict'

						return (
							<div
								key={p.id}
								className={`problem-card${p.resolved ? ' problem-card--resolved' : isError ? ' problem-card--error' : isWarning ? ' problem-card--warning' : ' problem-card--info'}`}
							>
								<div className="problem-card__top">
									<div className="problem-card__headline">
										{isError ? (
											<IconAlertCircle
												className="problems-btn-icon"
												style={{ color: '#ef4444', flexShrink: 0 }}
											/>
										) : isWarning ? (
											<IconAlertTriangle
												className="problems-btn-icon"
												style={{ color: '#f59e0b', flexShrink: 0 }}
											/>
										) : (
											<IconInfo
												className="problems-btn-icon"
												style={{ color: '#3b82f6', flexShrink: 0 }}
											/>
										)}

										<span className="problem-card__title">{p.title}</span>

										<span
											className={`problem-badge${isConflict ? ' problem-badge--conflict' : isError ? ' problem-badge--error' : isWarning ? ' problem-badge--warning' : ' problem-badge--info'}`}
										>
											{p.category || p.source}
										</span>
									</div>

									<div className="problem-card__time">
										{new Date(p.createdAt).toLocaleTimeString([], {
											hour: '2-digit',
											minute: '2-digit',
										})}
									</div>
								</div>

								{/* Message */}
								<div className="problem-card__message">{p.message}</div>

								{/* File location if available */}
								{p.file && (
									<div
										className="problem-card__location"
										onClick={() => onOpenInEditor?.(p.file!, p.line, p.column)}
										title="Open in Code Editor"
									>
										<IconFile className="problems-btn-icon" />
										<span>
											{p.file}
											{p.line ? `:${p.line}` : ''}
											{p.column ? `:${p.column}` : ''}
										</span>
									</div>
								)}

								{/* Footer Actions */}
								<div className="problem-card__footer">
									<div className="problem-card__actions">
										{/* Fix with Agent */}
										<button
											type="button"
											className="problems-btn problems-btn--primary problems-btn--sm"
											onClick={() => handleFixWithAgent(p)}
											title="Send diagnostic context to Agent chat"
										>
											<IconAgent className="problems-btn-icon" />
											<span>Fix with Agent</span>
										</button>

										{/* Open in Editor */}
										{p.file && onOpenInEditor && (
											<button
												type="button"
												className="problems-btn problems-btn--sm"
												onClick={() => onOpenInEditor(p.file!, p.line, p.column)}
											>
												<IconCode className="problems-btn-icon" />
												<span>Open in Editor</span>
											</button>
										)}

										{/* View Changes (for merge conflicts) */}
										{isConflict && onNavigateToChanges && (
											<button
												type="button"
												className="problems-btn problems-btn--sm"
												onClick={onNavigateToChanges}
											>
												<IconChanges className="problems-btn-icon" />
												<span>View Changes</span>
											</button>
										)}

										{/* View in Git / GitHub */}
										{(p.source === 'git' || p.source === 'pull_request' || p.source === 'deployment') &&
											onNavigateToRepo && (
												<button
													type="button"
													className="problems-btn problems-btn--sm"
													onClick={onNavigateToRepo}
												>
													<IconRepo className="problems-btn-icon" />
													<span>View in Repo</span>
												</button>
											)}
									</div>

									<div className="problem-card__actions">
										{p.resolved ? (
											<button
												type="button"
												className="problems-btn problems-btn--sm"
												onClick={() => void handleReopen(p.id)}
												title="Reopen problem"
											>
												<span>Reopen</span>
											</button>
										) : (
											<button
												type="button"
												className="problems-btn problems-btn--sm"
												onClick={() => void handleResolve(p.id)}
												title="Mark problem as resolved"
											>
												<IconCheckCircle className="problems-btn-icon" />
												<span>Resolve</span>
											</button>
										)}

										<button
											type="button"
											className="problems-btn problems-btn--sm"
											onClick={() => void handleDelete(p.id)}
											title="Delete problem"
										>
											<IconTrash className="problems-btn-icon" />
										</button>
									</div>
								</div>
							</div>
						)
					})
				)}
			</div>
		</div>
	)
}

