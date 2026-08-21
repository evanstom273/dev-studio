import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GitHubRateLimits } from '@shared/types/github'
import type { Project } from '@shared/types/project'
import type { AgyQuotaUsage } from '@shared/types/system'
import {
	IconClock,
	IconGauge,
	IconRefresh,
	IconSparkles,
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

export function StatusView({ project, onRefreshProject }: StatusViewProps) {
	const { state: connState } = useConnection()
	const isConnected = connState.status === 'connected'

	const [refreshing, setRefreshing] = useState(false)
	const [lastSynced, setLastSynced] = useState<Date>(new Date())

	// Data states
	const [rateLimit, setRateLimit] = useState<GitHubRateLimits | null>(null)
	const [rateLimitError, setRateLimitError] = useState<string | null>(null)

	const [agyQuota, setAgyQuota] = useState<AgyQuotaUsage | null>(null)
	const [agyError, setAgyError] = useState<string | null>(null)

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

	const loadAgyQuota = useCallback(async () => {
		try {
			setAgyError(null)
			const data = await systemApi.getAgyQuota(project.id)
			setAgyQuota(data)
		} catch (err) {
			setAgyError(err instanceof Error ? err.message : 'Failed to load Antigravity quota')
		}
	}, [project.id])

	// Unified Refresh action
	const handleRefreshAll = useCallback(async () => {
		setRefreshing(true)
		try {
			if (isConnected) {
				await gitApi.fetch(project.id).catch(() => {})
			}
			await Promise.allSettled([
				loadRateLimit(),
				loadAgyQuota(),
				onRefreshProject?.(),
			])
			setLastSynced(new Date())
		} finally {
			setRefreshing(false)
		}
	}, [isConnected, project.id, loadRateLimit, loadAgyQuota, onRefreshProject])

	// Initial load
	useEffect(() => {
		void handleRefreshAll()
	}, [handleRefreshAll])

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
		const total = agyQuota?.activeSessionTokens?.totalTokens ?? 0
		const limit = 1_000_000
		return {
			inputTokens: agyQuota?.activeSessionTokens?.inputTokens ?? 0,
			outputTokens: agyQuota?.activeSessionTokens?.outputTokens ?? 0,
			thinkingTokens: agyQuota?.activeSessionTokens?.thinkingTokens ?? 0,
			totalTokens: total,
			turnsCount: 0,
			messagesCount: 0,
			tokenLimit: limit,
			tokensRemaining: Math.max(0, limit - total),
			percentUsed: Math.min(100, Math.round((total / limit) * 100)),
			activeModel: agyQuota?.activeModel || 'gemini-3.7-flash-high',
		}
	}, [agyQuota])

	const sessionPercent = sessionQuota.percentUsed
	const sessionFillClass =
		sessionPercent < 60
			? 'status-progress-bar__fill--cyan'
			: sessionPercent < 85
				? 'status-progress-bar__fill--amber'
				: 'status-progress-bar__fill--red'

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
						title="Git fetch, refresh API rate limits, and Antigravity quota"
					>
						<IconRefresh className={refreshing ? 'status-refresh-btn__icon--spinning' : ''} />
						<span>{refreshing ? 'Fetching…' : 'Refresh All'}</span>
					</button>
				</div>
			</header>

			<div className="status-grid">
				{/* 1. GitHub API Rate Limit */}
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
									<div className="status-quota-group__val">
										{formatNumber(weeklyQuota.totalTokens)}{' '}
										<span className="status-metric__total">
											/ {formatNumber(weeklyQuota.tokenLimit)} tokens
										</span>
									</div>
									<span className="status-metric__percent-badge">
										{weeklyQuota.percentUsed}% used ({100 - weeklyQuota.percentUsed}% free)
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
									{sessionQuota.activeModel && (
										<span className="status-tag">
											{sessionQuota.activeModel}
										</span>
									)}
								</div>

								<div className="status-metric__row">
									<div className="status-quota-group__val">
										{formatNumber(sessionQuota.totalTokens)}{' '}
										<span className="status-metric__total">
											/ {formatNumber(sessionQuota.tokenLimit)} ctx
										</span>
									</div>
									<span className="status-metric__percent-badge">
										{sessionQuota.percentUsed}% used ({100 - sessionQuota.percentUsed}% free)
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

