import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GitHubPagesStatus, GitHubRateLimits, GitHubWorkflowRun } from '@shared/types/github'
import type { Project } from '@shared/types/project'
import type { AgyQuotaUsage } from '@shared/types/system'
import {
	IconCheck,
	IconClock,
	IconCopy,
	IconExternalLink,
	IconGauge,
	IconRefresh,
	IconSparkles,
	IconWorkflow,
} from '../components/Icons'
import { useConnection } from '../hooks/useConnection'
import { gitApi } from '../services/gitApi'
import { githubApi } from '../services/githubApi'
import { systemApi } from '../services/systemApi'
import '../styles/status.css'

type StatusViewProps = {
	project: Project
	onRefreshProject?: () => Promise<void>
}

function formatCountdown(seconds: number): string {
	if (seconds <= 0) return 'Resetting now'
	const days = Math.floor(seconds / 86400)
	const hours = Math.floor((seconds % 86400) / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = seconds % 60

	if (days > 0) {
		return `${days}d ${hours}h ${minutes}m`
	}
	if (hours > 0) {
		return `${hours}h ${minutes}m ${secs}s`
	}
	return `${minutes}m ${secs}s`
}

function formatNumber(num: number | undefined): string {
	if (num === undefined) return '0'
	return new Intl.NumberFormat().format(num)
}

function formatBytes(bytes: number | undefined): string {
	if (!bytes || bytes <= 0) return '0 MB'
	const gb = bytes / (1024 * 1024 * 1024)
	if (gb >= 1) return `${gb.toFixed(1)} GB`
	const mb = bytes / (1024 * 1024)
	return `${mb.toFixed(0)} MB`
}

function formatUptime(seconds: number | undefined): string {
	if (!seconds) return '0m'
	const d = Math.floor(seconds / 86400)
	const h = Math.floor((seconds % 86400) / 3600)
	const m = Math.floor((seconds % 3600) / 60)
	if (d > 0) return `${d}d ${h}h ${m}m`
	if (h > 0) return `${h}h ${m}m`
	return `${m}m`
}

function formatTimeAgo(isoString: string): string {
	const ms = Date.now() - new Date(isoString).getTime()
	const secs = Math.floor(ms / 1000)
	if (secs < 60) return `${secs}s ago`
	const mins = Math.floor(secs / 60)
	if (mins < 60) return `${mins}m ago`
	const hours = Math.floor(mins / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	return `${days}d ago`
}

export function StatusView({ project, onRefreshProject }: StatusViewProps) {
	const { state: connState } = useConnection()
	const isConnected = connState.status === 'connected'

	const [refreshing, setRefreshing] = useState(false)
	const [lastSynced, setLastSynced] = useState<Date>(new Date())

	// Data states
	const [rateLimit, setRateLimit] = useState<GitHubRateLimits | null>(null)
	const [rateLimitError, setRateLimitError] = useState<string | null>(null)

	const [workflows, setWorkflows] = useState<GitHubWorkflowRun[]>([])
	const [pagesStatus, setPagesStatus] = useState<GitHubPagesStatus | null>(null)
	const [workflowsError, setWorkflowsError] = useState<string | null>(null)

	const [agyQuota, setAgyQuota] = useState<AgyQuotaUsage | null>(null)
	const [agyError, setAgyError] = useState<string | null>(null)

	const [copiedPagesUrl, setCopiedPagesUrl] = useState(false)
	const [now, setNow] = useState(Date.now())

	// Live second timer for countdown calculation
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(timer)
	}, [])

	const loadRateLimit = useCallback(async () => {
		try {
			setRateLimitError(null)
			const data = await githubApi.getRateLimit()
			setRateLimit(data)
		} catch (err) {
			setRateLimitError(err instanceof Error ? err.message : 'Failed to fetch rate limit')
		}
	}, [])

	const loadWorkflows = useCallback(async () => {
		try {
			setWorkflowsError(null)
			const data = await githubApi.getWorkflows(project.id, 10)
			setWorkflows(data.runs || [])
			setPagesStatus(data.pages || null)
		} catch (err) {
			setWorkflowsError(err instanceof Error ? err.message : 'Failed to load GitHub workflows')
		}
	}, [project.id])

	const loadAgyQuota = useCallback(async () => {
		if (!isConnected) return
		try {
			setAgyError(null)
			const data = await systemApi.getAgyQuota(project.id)
			setAgyQuota(data)
		} catch (err) {
			setAgyError(err instanceof Error ? err.message : 'Failed to load Antigravity quota')
		}
	}, [isConnected, project.id])

	// Unified Refresh action
	const handleRefreshAll = useCallback(async () => {
		setRefreshing(true)
		try {
			if (isConnected) {
				await gitApi.fetch(project.id).catch(() => {})
			}
			await Promise.allSettled([
				loadWorkflows(),
				loadRateLimit(),
				loadAgyQuota(),
				onRefreshProject?.(),
			])
			setLastSynced(new Date())
		} finally {
			setRefreshing(false)
		}
	}, [isConnected, project.id, loadWorkflows, loadRateLimit, loadAgyQuota, onRefreshProject])

	// Initial load
	useEffect(() => {
		void handleRefreshAll()
	}, [handleRefreshAll])

	// Check if any workflow is currently running or queued
	const isWorkflowRunning = useMemo(() => {
		return workflows.some(
			(run) => run.status === 'in_progress' || run.status === 'queued' || run.status === 'pending',
		)
	}, [workflows])

	// Live polling while workflow is in progress (every 3 seconds)
	useEffect(() => {
		if (!isWorkflowRunning) return
		const pollInterval = setInterval(() => {
			void loadWorkflows()
		}, 3000)
		return () => clearInterval(pollInterval)
	}, [isWorkflowRunning, loadWorkflows])

	// Computed Core rate limit countdown
	const coreResetSeconds = useMemo(() => {
		if (!rateLimit?.rate?.reset) return 0
		const targetMs = rateLimit.rate.reset * 1000
		return Math.max(0, Math.floor((targetMs - now) / 1000))
	}, [rateLimit, now])

	// Core rate limit percent
	const corePercent = useMemo(() => {
		if (!rateLimit?.rate?.limit) return 100
		return Math.max(0, Math.min(100, Math.round((rateLimit.rate.remaining / rateLimit.rate.limit) * 100)))
	}, [rateLimit])

	const coreFillClass =
		corePercent > 50
			? 'status-progress-bar__fill--green'
			: corePercent > 15
				? 'status-progress-bar__fill--amber'
				: 'status-progress-bar__fill--red'

	// Computed Antigravity Weekly Quota
	const weeklyQuota = useMemo(() => {
		if (agyQuota?.weeklyQuota) return agyQuota.weeklyQuota
		const total = agyQuota?.totalTokens?.totalTokens ?? 0
		const limit = 10_000_000
		return {
			inputTokens: agyQuota?.totalTokens?.inputTokens ?? 0,
			outputTokens: agyQuota?.totalTokens?.outputTokens ?? 0,
			thinkingTokens: agyQuota?.totalTokens?.thinkingTokens ?? 0,
			totalTokens: total,
			promptsCount: 0,
			tokenLimit: limit,
			tokensRemaining: Math.max(0, limit - total),
			percentUsed: Math.min(100, Math.round((total / limit) * 100)),
			resetAt: new Date(Date.now() + 86400000 * 7).toISOString(),
			resetSeconds: 86400 * 7,
		}
	}, [agyQuota])

	// Weekly reset countdown
	const weeklyResetSeconds = useMemo(() => {
		if (!weeklyQuota?.resetAt) return 0
		const targetMs = new Date(weeklyQuota.resetAt).getTime()
		return Math.max(0, Math.floor((targetMs - now) / 1000))
	}, [weeklyQuota?.resetAt, now])

	const weeklyPercent = weeklyQuota.percentUsed
	const weeklyFillClass =
		weeklyPercent < 60
			? 'status-progress-bar__fill--green'
			: weeklyPercent < 85
				? 'status-progress-bar__fill--amber'
				: 'status-progress-bar__fill--red'

	// Computed Antigravity Session Quota
	const sessionQuota = useMemo(() => {
		if (agyQuota?.sessionQuota) return agyQuota.sessionQuota
		if (agyQuota?.activeSessionTokens) {
			const total = agyQuota.activeSessionTokens.totalTokens
			const limit = 1_000_000
			return {
				inputTokens: agyQuota.activeSessionTokens.inputTokens,
				outputTokens: agyQuota.activeSessionTokens.outputTokens,
				thinkingTokens: agyQuota.activeSessionTokens.thinkingTokens,
				totalTokens: total,
				turnsCount: 0,
				messagesCount: 0,
				tokenLimit: limit,
				tokensRemaining: Math.max(0, limit - total),
				percentUsed: Math.min(100, Math.round((total / limit) * 100)),
				activeModel: agyQuota.activeModel,
			}
		}
		return null
	}, [agyQuota])

	const sessionPercent = sessionQuota?.percentUsed ?? 0
	const sessionFillClass =
		sessionPercent < 60
			? 'status-progress-bar__fill--cyan'
			: sessionPercent < 85
				? 'status-progress-bar__fill--amber'
				: 'status-progress-bar__fill--red'

	// Latest Workflow Run
	const latestRun = workflows[0] || null

	const handleCopyPagesUrl = async (url: string) => {
		try {
			await navigator.clipboard.writeText(url)
			setCopiedPagesUrl(true)
			setTimeout(() => setCopiedPagesUrl(false), 2000)
		} catch {
			// ignore
		}
	}

	return (
		<main className="status-view" role="main" aria-label="Status & Quota Dashboard">
			{/* Top Header & Unified Refresh */}
			<header className="status-header">
				<div className="status-header__info">
					<h1 className="status-header__title">
						<IconGauge className="status-card__icon" />
						Status & Quotas
					</h1>
					<span className="status-header__meta">
						Last synced: {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
					</span>
				</div>

				<div className="status-header__actions">
					<button
						type="button"
						className="status-refresh-btn"
						onClick={() => void handleRefreshAll()}
						disabled={refreshing}
						title="Git fetch, refresh workflow status, API rate limits, and Antigravity quota"
					>
						<IconRefresh className={refreshing ? 'status-refresh-btn__icon--spinning' : ''} />
						<span>{refreshing ? 'Fetching…' : 'Refresh All'}</span>
					</button>
				</div>
			</header>

			<div className="status-grid">
				{/* 1. GitHub Pages & Actions Workflow State */}
				<section className="status-card status-card--full" aria-labelledby="workflow-title">
					<div className="status-card__header">
						<h2 id="workflow-title" className="status-card__title">
							<IconWorkflow className="status-card__icon" />
							GitHub Pages & Workflow Runs
						</h2>
						{isWorkflowRunning ? (
							<span className="status-card__badge status-card__badge--live">
								<span className="pulse-dot" />
								Deploying (polling 3s)
							</span>
						) : latestRun?.conclusion === 'success' ? (
							<span className="status-card__badge status-card__badge--ok">
								✓ Deployed
							</span>
						) : latestRun?.conclusion === 'failure' ? (
							<span className="status-card__badge status-card__badge--error">
								Failed
							</span>
						) : null}
					</div>

					{/* GitHub Pages Live Deployment Banner */}
					{pagesStatus?.htmlUrl && (
						<div className="status-pages-banner">
							<div className="status-pages-banner__url" title={pagesStatus.htmlUrl}>
								🌐 {pagesStatus.htmlUrl}
							</div>
							<div className="status-pages-banner__actions">
								<button
									type="button"
									className="btn btn--ghost btn--xs"
									onClick={() => void handleCopyPagesUrl(pagesStatus.htmlUrl!)}
									title="Copy Live URL"
								>
									{copiedPagesUrl ? <IconCheck /> : <IconCopy />}
								</button>
								<a
									href={pagesStatus.htmlUrl}
									target="_blank"
									rel="noreferrer"
									className="btn btn--ghost btn--xs"
									title="Open Live Site in new tab"
								>
									<IconExternalLink />
								</a>
							</div>
						</div>
					)}

					{workflowsError && <p className="text-error" style={{ fontSize: '11px' }}>{workflowsError}</p>}

					{/* Latest Run Highlights */}
					{latestRun ? (
						<div className="status-workflow-latest">
							<div className="status-workflow-latest__top">
								<span className="status-workflow-latest__name">
									{latestRun.name || 'Workflow Run'} #{latestRun.runNumber}
								</span>
								<span
									className={`status-card__badge ${
										latestRun.status === 'in_progress'
											? 'status-card__badge--live'
											: latestRun.conclusion === 'success'
												? 'status-card__badge--ok'
												: latestRun.conclusion === 'failure'
													? 'status-card__badge--error'
													: 'status-card__badge--warn'
									}`}
								>
									{latestRun.status === 'in_progress'
										? 'In progress…'
										: latestRun.conclusion ?? latestRun.status}
								</span>
							</div>

							{latestRun.displayTitle && (
								<div className="status-workflow-latest__title">
									"{latestRun.displayTitle}"
								</div>
							)}

							<div className="status-workflow-latest__details">
								<span className="status-tag">{latestRun.headBranch}</span>
								<span>•</span>
								<span>{latestRun.headSha.slice(0, 7)}</span>
								<span>•</span>
								<span>Trigger: {latestRun.event}</span>
								<span>•</span>
								<span>{formatTimeAgo(latestRun.createdAt)}</span>
								{latestRun.htmlUrl && (
									<a
										href={latestRun.htmlUrl}
										target="_blank"
										rel="noreferrer"
										className="btn btn--ghost btn--xs"
										style={{ marginLeft: 'auto', fontSize: '10px', height: '20px' }}
									>
										View Run <IconExternalLink />
									</a>
								)}
							</div>
						</div>
					) : (
						!workflowsError && <p className="text-muted" style={{ fontSize: '11px' }}>No workflow runs detected for this repository.</p>
					)}

					{/* Recent Runs List */}
					{workflows.length > 1 && (
						<div className="status-runs-list">
							<div className="text-muted" style={{ fontSize: '10px', fontWeight: 600 }}>
								Recent Runs
							</div>
							{workflows.slice(1, 4).map((run) => (
								<a
									key={run.id}
									href={run.htmlUrl}
									target="_blank"
									rel="noreferrer"
									className="status-run-item"
								>
									<div className="status-run-item__left">
										<span
											className="status-run-item__dot"
											style={{
												background:
													run.status === 'in_progress'
														? 'var(--accent)'
														: run.conclusion === 'success'
															? '#22c55e'
															: run.conclusion === 'failure'
																? '#ef4444'
																: 'var(--text-muted)',
											}}
										/>
										<span className="status-run-item__title">
											{run.name} • {run.displayTitle || run.headBranch}
										</span>
									</div>
									<span className="status-run-item__time">{formatTimeAgo(run.createdAt)}</span>
								</a>
							))}
						</div>
					)}
				</section>

				{/* 2. GitHub API Rate Limit */}
				<section className="status-card" aria-labelledby="rate-limit-title">
					<div className="status-card__header">
						<h2 id="rate-limit-title" className="status-card__title">
							<IconClock className="status-card__icon" />
							GitHub API Rate Limit
						</h2>
						{rateLimit && (
							<span className="status-card__badge status-card__badge--live">
								{corePercent}% available
							</span>
						)}
					</div>

					{rateLimitError && <p className="text-error" style={{ fontSize: '11px' }}>{rateLimitError}</p>}

					{rateLimit ? (
						<div className="status-metric">
							<div className="status-metric__row">
								<div className="status-metric__value">
									{formatNumber(rateLimit.rate.remaining)}{' '}
									<span className="status-metric__total">/ {formatNumber(rateLimit.rate.limit)} req</span>
								</div>
								<div className="status-metric__countdown">
									<IconClock className="status-card__icon" />
									<span>Resets: {formatCountdown(coreResetSeconds)}</span>
								</div>
							</div>

							<div className="status-progress-bar">
								<div
									className={`status-progress-bar__fill ${coreFillClass}`}
									style={{ width: `${corePercent}%` }}
								/>
							</div>

							{/* Secondary Rate Limits */}
							<div className="status-submetrics">
								{rateLimit.resources.search && (
									<div className="status-submetric-pill">
										<span className="status-submetric-pill__label">Search API</span>
										<span className="status-submetric-pill__val">
											{rateLimit.resources.search.remaining} / {rateLimit.resources.search.limit}
										</span>
									</div>
								)}
								{rateLimit.resources.graphql && (
									<div className="status-submetric-pill">
										<span className="status-submetric-pill__label">GraphQL API</span>
										<span className="status-submetric-pill__val">
											{rateLimit.resources.graphql.remaining} / {rateLimit.resources.graphql.limit}
										</span>
									</div>
								)}
							</div>
						</div>
					) : (
						!rateLimitError && <p className="text-muted" style={{ fontSize: '11px' }}>Connecting to GitHub API…</p>
					)}
				</section>

				{/* 3. Antigravity Quotas & Limits (Weekly, Session, All-Time) */}
				<section className="status-card" aria-labelledby="agy-quota-title">
					<div className="status-card__header">
						<h2 id="agy-quota-title" className="status-card__title">
							<IconSparkles className="status-card__icon" />
							Antigravity Quotas & Limits
						</h2>
						{agyQuota?.authenticated ? (
							<span className="status-card__badge status-card__badge--ok">
								✓ Ready
							</span>
						) : (
							<span className="status-card__badge status-card__badge--warn">
								{agyQuota?.available ? 'Ready' : 'Disconnected'}
							</span>
						)}
					</div>

					{agyError && <p className="text-error" style={{ fontSize: '11px' }}>{agyError}</p>}

					{agyQuota ? (
						<div className="status-quota-section">
							{/* Weekly Quota Widget */}
							<div className="status-quota-group">
								<div className="status-quota-group__header">
									<span className="status-quota-group__title">Weekly Limit</span>
									<div className="status-metric__countdown">
										<IconClock className="status-card__icon" />
										<span>Resets: {formatCountdown(weeklyResetSeconds)}</span>
									</div>
								</div>

								<div className="status-metric__row">
									<span className="status-quota-group__val">
										{formatNumber(weeklyQuota.totalTokens)}{' '}
										<span className="status-metric__total">
											/ {formatNumber(weeklyQuota.tokenLimit)} tokens ({weeklyQuota.percentUsed}% used)
										</span>
									</span>
									<span className="text-muted" style={{ fontSize: '10px' }}>
										{100 - weeklyQuota.percentUsed}% free
									</span>
								</div>

								<div className="status-progress-bar">
									<div
										className={`status-progress-bar__fill ${weeklyFillClass}`}
										style={{ width: `${Math.max(1, weeklyPercent)}%` }}
									/>
								</div>

								<div className="status-quota-pills">
									<span className="status-quota-pill">
										Prompts: <span className="status-quota-pill__highlight">{weeklyQuota.promptsCount}</span>
									</span>
									<span className="status-quota-pill">
										Input: <span className="status-quota-pill__highlight">{formatNumber(weeklyQuota.inputTokens)}</span>
									</span>
									<span className="status-quota-pill">
										Output: <span className="status-quota-pill__highlight">{formatNumber(weeklyQuota.outputTokens)}</span>
									</span>
								</div>
							</div>

							{/* Active Session Limit Widget */}
							<div className="status-quota-group">
								<div className="status-quota-group__header">
									<span className="status-quota-group__title">Active Session Limit</span>
									{sessionQuota?.activeModel && (
										<span className="status-tag">
											{sessionQuota.activeModel}
										</span>
									)}
								</div>

								{sessionQuota ? (
									<>
										<div className="status-metric__row">
											<span className="status-quota-group__val">
												{formatNumber(sessionQuota.totalTokens)}{' '}
												<span className="status-metric__total">
													/ {formatNumber(sessionQuota.tokenLimit)} ctx tokens ({sessionQuota.percentUsed}% used)
												</span>
											</span>
											<span className="text-muted" style={{ fontSize: '10px' }}>
												{100 - sessionQuota.percentUsed}% context free
											</span>
										</div>

										<div className="status-progress-bar">
											<div
												className={`status-progress-bar__fill ${sessionFillClass}`}
												style={{ width: `${Math.max(1, sessionPercent)}%` }}
											/>
										</div>

										<div className="status-quota-pills">
											<span className="status-quota-pill">
												Turns: <span className="status-quota-pill__highlight">{sessionQuota.turnsCount}</span>
											</span>
											<span className="status-quota-pill">
												Input: <span className="status-quota-pill__highlight">{formatNumber(sessionQuota.inputTokens)}</span>
											</span>
											<span className="status-quota-pill">
												Output: <span className="status-quota-pill__highlight">{formatNumber(sessionQuota.outputTokens)}</span>
											</span>
										</div>
									</>
								) : (
									<p className="text-muted" style={{ fontSize: '10.5px', margin: '2px 0' }}>
										No tokens used in current session.
									</p>
								)}
							</div>

							{/* All-Time Cumulative Tokens */}
							{agyQuota.totalTokens && (
								<div className="status-quota-group">
									<div className="status-quota-group__header">
										<span className="status-quota-group__title">All-Time Cumulative</span>
										<span className="status-quota-group__val">
											{formatNumber(agyQuota.totalTokens.totalTokens)} tokens
										</span>
									</div>
									<div className="status-quota-pills">
										<span className="status-quota-pill">
											Input: <span className="status-quota-pill__highlight">{formatNumber(agyQuota.totalTokens.inputTokens)}</span>
										</span>
										<span className="status-quota-pill">
											Output: <span className="status-quota-pill__highlight">{formatNumber(agyQuota.totalTokens.outputTokens)}</span>
										</span>
										{Boolean(agyQuota.totalTokens.thinkingTokens) && (
											<span className="status-quota-pill">
												Thinking: <span className="status-quota-pill__highlight">{formatNumber(agyQuota.totalTokens.thinkingTokens)}</span>
											</span>
										)}
									</div>
								</div>
							)}

							{/* Host Backend Telemetry */}
							{agyQuota.laptopStats && (
								<div className="status-host-bar">
									<span><strong>Host:</strong> RAM {formatBytes(agyQuota.laptopStats.usedMemBytes)} / {formatBytes(agyQuota.laptopStats.totalMemBytes)} ({agyQuota.laptopStats.memoryUsagePercent}%)</span>
									<span>•</span>
									<span>{agyQuota.laptopStats.platform}</span>
									<span>•</span>
									<span>Node {agyQuota.laptopStats.nodeVersion}</span>
									<span>•</span>
									<span>Uptime {formatUptime(agyQuota.laptopStats.uptimeSeconds)}</span>
								</div>
							)}

							{/* Available Models */}
							{agyQuota.availableModels && agyQuota.availableModels.length > 0 && (
								<div>
									<span className="text-muted" style={{ fontSize: '10px' }}>Supported Models</span>
									<div className="status-models-list">
										{agyQuota.availableModels.slice(0, 5).map((m) => (
											<span
												key={m}
												className={`status-model-chip ${m === agyQuota.activeModel ? 'status-model-chip--active' : ''}`}
											>
												{m}
											</span>
										))}
									</div>
								</div>
							)}
						</div>
					) : (
						!agyError && <p className="text-muted" style={{ fontSize: '11px' }}>Connecting to laptop backend…</p>
					)}
				</section>
			</div>
		</main>
	)
}

