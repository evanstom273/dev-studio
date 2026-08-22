import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GitHubRateLimits } from '@shared/types/github'
import type { Project } from '@shared/types/project'
import type { AgyQuotaUsage, QuotaBucket, QuotaGroup } from '@shared/types/system'
import {
	IconClock,
	IconFolder,
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

function remainingFillClass(percentRemaining: number | null, available: boolean): string {
	if (available || percentRemaining === null) return 'status-progress-bar__fill--green'
	if (percentRemaining > 50) return 'status-progress-bar__fill--green'
	if (percentRemaining > 15) return 'status-progress-bar__fill--amber'
	return 'status-progress-bar__fill--red'
}

function bucketResetSeconds(bucket: QuotaBucket, fetchedAtMs: number, nowMs: number): number {
	if (bucket.resetSeconds !== null && bucket.resetSeconds !== undefined) {
		const elapsed = Math.floor((nowMs - fetchedAtMs) / 1000)
		return Math.max(0, bucket.resetSeconds - elapsed)
	}
	if (bucket.resetAt) {
		return Math.max(0, Math.floor((new Date(bucket.resetAt).getTime() - nowMs) / 1000))
	}
	return 0
}

function bucketStatusLabel(bucket: QuotaBucket): string {
	if (bucket.available) return 'Quota available'
	if (bucket.percentRemaining === null) return 'Unknown'
	return `${bucket.percentRemaining}% remaining`
}

function QuotaBucketRow({
	bucket,
	fetchedAtMs,
	nowMs,
	showPercentages = false,
}: {
	bucket: QuotaBucket
	fetchedAtMs: number
	nowMs: number
	showPercentages?: boolean
}) {
	const resetSeconds = bucketResetSeconds(bucket, fetchedAtMs, nowMs)
	const fillClass = remainingFillClass(bucket.percentRemaining, bucket.available)
	const barWidth = showPercentages && bucket.percentRemaining !== null
		? Math.max(1, bucket.percentRemaining)
		: bucket.available
			? 100
			: bucket.percentRemaining === null
			? 1
			: Math.max(1, bucket.percentRemaining)

	return (
		<div className="status-quota-group">
			<div className="status-quota-group__header">
				<span className="status-quota-group__title">{bucket.label}</span>
				{(resetSeconds > 0 || bucket.resetAt) && (
					<div className="status-metric__countdown">
						<IconClock className="status-card__icon" />
						<span>Resets: {formatCountdown(resetSeconds)}</span>
					</div>
				)}
			</div>

			<div className="status-metric__row">
				<div className="status-quota-group__val">
					{showPercentages && bucket.percentRemaining !== null
						? `${bucket.percentRemaining}% remaining`
						: bucketStatusLabel(bucket)}
				</div>
				{showPercentages && bucket.percentUsed !== null && (
					<span className="status-metric__percent-badge">
						{bucket.percentUsed}% used
					</span>
				)}
			</div>

			<div className="status-progress-bar">
				<div
					className={`status-progress-bar__fill ${fillClass}`}
					style={{ width: `${barWidth}%` }}
				/>
			</div>

			{bucket.description && (
				<span className="text-muted" style={{ fontSize: '10px' }}>
					{bucket.description}
				</span>
			)}
		</div>
	)
}

function QuotaGroupCard({
	group,
	fetchedAtMs,
	nowMs,
	showPercentages = false,
}: {
	group: QuotaGroup
	fetchedAtMs: number
	nowMs: number
	showPercentages?: boolean
}) {
	return (
		<div className="status-quota-section">
			<div className="status-quota-group__header">
				<span className="status-quota-group__title">{group.name}</span>
			</div>
			{group.models && (
				<span className="text-muted" style={{ fontSize: '10px', marginBottom: '2px' }}>
					{group.models}
				</span>
			)}
			{group.buckets.map((bucket) => (
				<QuotaBucketRow
					key={`${group.name}-${bucket.kind}-${bucket.label}`}
					bucket={bucket}
					fetchedAtMs={fetchedAtMs}
					nowMs={nowMs}
					showPercentages={showPercentages}
				/>
			))}
		</div>
	)
}

export function StatusView({ project, onRefreshProject }: StatusViewProps) {
	const { state: connState } = useConnection()
	const isConnected = connState.status === 'connected'

	const [refreshing, setRefreshing] = useState(false)
	const [lastSynced, setLastSynced] = useState<Date>(new Date())

	const [rateLimit, setRateLimit] = useState<GitHubRateLimits | null>(null)
	const [rateLimitError, setRateLimitError] = useState<string | null>(null)

	const [agyQuota, setAgyQuota] = useState<AgyQuotaUsage | null>(null)
	const [agyError, setAgyError] = useState<string | null>(null)

	const [now, setNow] = useState(Date.now())

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

	const loadAgyQuota = useCallback(async (refresh = false) => {
		try {
			setAgyError(null)
			const data = await systemApi.getAgyQuota(project.id, refresh)
			setAgyQuota(data)
			if (data.quotaError) {
				setAgyError(data.quotaError)
			}
		} catch (err) {
			setAgyError(err instanceof Error ? err.message : 'Failed to load Antigravity quota')
		}
	}, [project.id])

	const handleRefreshAll = useCallback(async () => {
		setRefreshing(true)
		try {
			if (isConnected) {
				await gitApi.fetch(project.id).catch(() => {})
			}
			await Promise.allSettled([
				loadRateLimit(),
				loadAgyQuota(true),
				onRefreshProject?.(),
			])
			setLastSynced(new Date())
		} finally {
			setRefreshing(false)
		}
	}, [isConnected, project.id, loadRateLimit, loadAgyQuota, onRefreshProject])

	useEffect(() => {
		void handleRefreshAll()
	}, [handleRefreshAll])

	const coreResetSeconds = useMemo(() => {
		if (!rateLimit?.rate?.reset) return 0
		const targetMs = rateLimit.rate.reset * 1000
		return Math.max(0, Math.floor((targetMs - now) / 1000))
	}, [rateLimit, now])

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

	const quotaFetchedAtMs = useMemo(() => {
		const fetchedAt = agyQuota?.quota?.fetchedAt
		return fetchedAt ? new Date(fetchedAt).getTime() : Date.now()
	}, [agyQuota?.quota?.fetchedAt])

	const codexQuotaFetchedAtMs = useMemo(() => {
		const fetchedAt = agyQuota?.codexQuota?.fetchedAt
		return fetchedAt ? new Date(fetchedAt).getTime() : Date.now()
	}, [agyQuota?.codexQuota?.fetchedAt])

	const agyBadge = useMemo(() => {
		if (!agyQuota?.available) {
			return { className: 'status-card__badge--warn', label: 'Disconnected' }
		}
		if (agyQuota.quotaError) {
			return { className: 'status-card__badge--warn', label: 'Quota unavailable' }
		}
		if (agyQuota.quotaHealth?.exhausted) {
			return { className: 'status-card__badge--error', label: 'Quota exhausted' }
		}
		if (agyQuota.quotaHealth?.low) {
			return {
				className: 'status-card__badge--warn',
				label: `${agyQuota.quotaHealth.worstRemainingPercent}% left`,
			}
		}
		if (agyQuota.quota?.groups.length) {
			return { className: 'status-card__badge--ok', label: '✓ Ready' }
		}
		if (agyQuota.authenticated) {
			return { className: 'status-card__badge--ok', label: '✓ Ready' }
		}
		return { className: 'status-card__badge--warn', label: 'Not signed in' }
	}, [agyQuota])

	const codexBadge = useMemo(() => {
		const codexProvider = agyQuota?.providers?.find((p) => p.id === 'codex')
		if (codexProvider && !codexProvider.available) {
			return { className: 'status-card__badge--warn', label: 'Not installed' }
		}
		if (codexProvider && !codexProvider.authenticated) {
			return { className: 'status-card__badge--warn', label: 'Sign in required' }
		}
		if (agyQuota?.codexQuotaError) {
			return { className: 'status-card__badge--warn', label: 'Quota unavailable' }
		}
		if (agyQuota?.codexQuotaHealth?.exhausted) {
			return { className: 'status-card__badge--error', label: 'Quota exhausted' }
		}
		if (agyQuota?.codexQuotaHealth?.low) {
			return {
				className: 'status-card__badge--warn',
				label: `${agyQuota.codexQuotaHealth.worstRemainingPercent}% left`,
			}
		}
		if (agyQuota?.codexQuota?.groups.length) {
			return { className: 'status-card__badge--ok', label: '✓ Ready' }
		}
		return { className: 'status-card__badge--ok', label: '✓ Ready' }
	}, [agyQuota])

	return (
		<main className="status-view" role="main" aria-label="Status & Quota Dashboard">
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
				<section className="status-card" aria-labelledby="workspace-info-title">
					<div className="status-card__header">
						<h2 id="workspace-info-title" className="status-card__title">
							<IconFolder className="status-card__icon" />
							Workspace Information
						</h2>
						<span className="status-card__badge status-card__badge--ok">
							{project.workspaceSource === 'local' || project.storage === 'local'
								? 'Local Project'
								: 'Managed Workspace'}
						</span>
					</div>

					<div className="status-metric">
						<div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
							<div>
								<span className="text-muted" style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Workspace Root</span>
								<code style={{ fontSize: '11px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{project.path}</code>
							</div>
							<div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
								<div>
									<span className="text-muted" style={{ fontSize: '10px', display: 'block' }}>Type</span>
									<span>{project.workspaceSource === 'local' || project.storage === 'local' ? 'Local Directory' : 'GitHub Clone'}</span>
								</div>
								<div>
									<span className="text-muted" style={{ fontSize: '10px', display: 'block' }}>Git</span>
									<span>{project.isGitRepo ? (project.defaultBranch ? `Branch ${project.defaultBranch}` : 'Initialized') : 'Not a Git repository'}</span>
								</div>
								{project.repositoryLabel && (
									<div>
										<span className="text-muted" style={{ fontSize: '10px', display: 'block' }}>Remote</span>
										<span className="text-truncate" style={{ maxWidth: '200px', display: 'inline-block' }}>{project.repositoryLabel}</span>
									</div>
								)}
							</div>
						</div>
					</div>
				</section>

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

				{agyQuota?.providers && agyQuota.providers.length > 0 && (
					<section className="status-card" aria-labelledby="providers-title">
						<div className="status-card__header">
							<h2 id="providers-title" className="status-card__title">
								<IconSparkles className="status-card__icon" />
								Coding Agent Providers
							</h2>
							<span className="status-card__badge status-card__badge--ok">
								{agyQuota.providers.filter((p) => p.status === 'ready').length} / {agyQuota.providers.length} Active
							</span>
						</div>

						<div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
							{agyQuota.providers.map((provider) => {
								const isReady = provider.status === 'ready'
								const isNotAuth = provider.status === 'not_authenticated'
								const isNotInstalled = provider.status === 'not_installed'

								return (
									<div
										key={provider.id}
										style={{
											padding: '10px 12px',
											borderRadius: '8px',
											background: 'rgba(255, 255, 255, 0.02)',
											border: '1px solid var(--border-subtle)',
										}}
									>
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
											<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
												<strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{provider.name}</strong>
												{provider.version && (
													<span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{provider.version}</span>
												)}
											</div>
											<span
												className={`status-card__badge ${
													isReady
														? 'status-card__badge--ok'
														: isNotAuth
															? 'status-card__badge--warning'
															: 'status-card__badge--danger'
												}`}
											>
												{isReady
													? 'Ready'
													: isNotAuth
														? 'Sign in required'
														: isNotInstalled
															? 'Not installed'
															: 'Error'}
											</span>
										</div>

										{provider.message && (
											<p style={{ fontSize: '11px', color: isReady ? 'var(--text-secondary)' : 'var(--text-muted)', margin: '4px 0 6px 0' }}>
												{provider.message}
											</p>
										)}

										{provider.models.length > 0 && (
											<div>
												<span className="text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>
													Available Models ({provider.models.length})
												</span>
												<div className="status-models-list">
													{provider.models.map((m) => (
														<span
															key={m.id}
															className={`status-model-chip ${m.id === agyQuota.activeModel ? 'status-model-chip--active' : ''}`}
															title={m.id}
														>
															{m.name}
														</span>
													))}
												</div>
											</div>
										)}
									</div>
								)
							})}
						</div>
					</section>
				)}

				<section className="status-card" aria-labelledby="agy-quota-title">
					<div className="status-card__header">
						<h2 id="agy-quota-title" className="status-card__title">
							<IconSparkles className="status-card__icon" />
							Antigravity Quotas & Limits
						</h2>
						{agyQuota && (
							<span className={`status-card__badge ${agyBadge.className}`}>
								{agyBadge.label}
							</span>
						)}
					</div>

					{agyError && <p className="text-error" style={{ fontSize: '11px' }}>{agyError}</p>}

					{agyQuota ? (
						<div className="status-quota-section">
							{(agyQuota.quota?.account || agyQuota.quota?.tier) && (
								<div className="status-quota-pills">
									{agyQuota.quota?.account && (
										<span className="status-quota-pill">
											Account: <span className="status-quota-pill__highlight">{agyQuota.quota.account}</span>
										</span>
									)}
									{agyQuota.quota?.tier && (
										<span className="status-quota-pill">
											Tier: <span className="status-quota-pill__highlight">{agyQuota.quota.tier}</span>
										</span>
									)}
									{agyQuota.quota?.source && (
										<span className="status-quota-pill">
											Source: <span className="status-quota-pill__highlight">{agyQuota.quota.source}</span>
										</span>
									)}
								</div>
							)}

							{agyQuota.quota?.groups.map((group) => (
								<QuotaGroupCard
									key={group.name}
									group={group}
									fetchedAtMs={quotaFetchedAtMs}
									nowMs={now}
								/>
							))}

							{!agyQuota.quota?.groups.length && !agyQuota.quotaError && (
								<p className="text-muted" style={{ fontSize: '11px' }}>
									No quota data returned. Sign in with `agy` on your laptop.
								</p>
							)}

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

				{(agyQuota?.codexQuota || agyQuota?.providers?.some((p) => p.id === 'codex' && p.available)) && (
					<section className="status-card" aria-labelledby="codex-quota-title">
						<div className="status-card__header">
							<h2 id="codex-quota-title" className="status-card__title">
								<IconSparkles className="status-card__icon" />
								OpenAI Codex Quotas & Limits
							</h2>
							{agyQuota && (
								<span className={`status-card__badge ${codexBadge.className}`}>
									{codexBadge.label}
								</span>
							)}
						</div>

						{agyQuota?.codexQuotaError && (
							<p className="text-error" style={{ fontSize: '11px' }}>{agyQuota.codexQuotaError}</p>
						)}

						{agyQuota?.codexQuota ? (
							<div className="status-quota-section">
								{(agyQuota.codexQuota.account || agyQuota.codexQuota.tier) && (
									<div className="status-quota-pills">
										{agyQuota.codexQuota.account && (
											<span className="status-quota-pill">
												Account: <span className="status-quota-pill__highlight">{agyQuota.codexQuota.account}</span>
											</span>
										)}
										{agyQuota.codexQuota.tier && (
											<span className="status-quota-pill">
												Plan: <span className="status-quota-pill__highlight">{agyQuota.codexQuota.tier}</span>
											</span>
										)}
										{agyQuota.codexQuota.note && (
											<span className="status-quota-pill">
												Status: <span className="status-quota-pill__highlight">{agyQuota.codexQuota.note}</span>
											</span>
										)}
									</div>
								)}

								{agyQuota.codexQuota.groups.map((group) => (
									<QuotaGroupCard
										key={group.name}
										group={group}
										fetchedAtMs={codexQuotaFetchedAtMs}
										nowMs={now}
										showPercentages
									/>
								))}
							</div>
						) : (
							<p className="text-muted" style={{ fontSize: '11px' }}>
								Run Codex turns or `codex login` to populate rate limit stats.
							</p>
						)}
					</section>
				)}
			</div>
		</main>
	)
}
