import { useState, useEffect, useMemo } from 'react'
import type {
	ActivityTimelineItem,
	AgentActivityDetail,
	AgentActivityItem,
} from '@shared/types/agent'
import {
	groupActivities,
	formatActivityDuration,
	formatThoughtHeader,
	type GroupedActivity,
} from '../utils/activityGrouping'
import {
	IconChevron,
	IconCheck,
	IconClose,
	IconFile,
	IconCode,
	IconTerminal,
	IconSearch,
	IconBranch,
	IconSparkles,
} from './Icons'
import '../styles/agent.css'

type ActivityTimelineProps = {
	timeline: ActivityTimelineItem
	isLive?: boolean
	defaultExpanded?: boolean
}

function getActivityIcon(type: string, title: string) {
	if (type === 'git' || title.toLowerCase().includes('branch') || title.toLowerCase().includes('commit')) {
		return IconBranch
	}
	if (type === 'command' || title.startsWith('$')) {
		return IconTerminal
	}
	if (type === 'edit') {
		return IconCode
	}
	if (type === 'read') {
		return IconFile
	}
	if (type === 'search') {
		return IconSearch
	}
	if (type === 'status') {
		return IconSparkles
	}
	return null
}

function DiffStats({ detail }: { detail?: AgentActivityDetail }) {
	const additions = detail?.additions
	const deletions = detail?.deletions

	if (additions === undefined && deletions === undefined) return null

	return (
		<span className="activity-diff-stats" aria-label={`+${additions ?? 0} -${deletions ?? 0} lines`}>
			{additions !== undefined && additions > 0 && (
				<span className="activity-diff-stat-add">+{additions}</span>
			)}
			{deletions !== undefined && deletions > 0 && (
				<span className="activity-diff-stat-del">-{deletions}</span>
			)}
		</span>
	)
}

function SingleActivityRow({ activity }: { activity: AgentActivityItem }) {
	const [expanded, setExpanded] = useState(false)
	const isRunning = activity.status === 'running'
	const isFailed = activity.status === 'failed'
	const isCommand = activity.type === 'command' || activity.title.startsWith('$')
	const Icon = getActivityIcon(activity.type, activity.title)

	const hasDetail = Boolean(
		activity.detail?.output ||
			activity.detail?.error ||
			activity.detail?.diff ||
			activity.detail?.instruction ||
			(activity.detail?.filePath && activity.detail.filePath !== activity.title) ||
			activity.detail?.command ||
			activity.detail?.query ||
			activity.detail?.directory,
	)

	return (
		<div
			className={`activity-timeline-row activity-timeline-row--${activity.status}${isRunning ? ' activity-timeline-row--active' : ''}${isCommand ? ' activity-timeline-row--command' : ''}`}
		>
			<div
				className={`activity-timeline-row__header${hasDetail ? ' is-clickable' : ''}`}
				onClick={() => hasDetail && setExpanded((prev) => !prev)}
				role={hasDetail ? 'button' : undefined}
				tabIndex={hasDetail ? 0 : undefined}
				onKeyDown={(e) => {
					if (hasDetail && (e.key === 'Enter' || e.key === ' ')) {
						e.preventDefault()
						setExpanded((prev) => !prev)
					}
				}}
			>
				{/* Status indicator */}
				<span className="activity-timeline-row__status" aria-hidden="true">
					{isRunning ? (
						<span className="activity-timeline-row__pulse-dot" />
					) : isFailed ? (
						<IconClose className="activity-timeline-row__status-icon activity-timeline-row__status-icon--error" />
					) : (
						<IconCheck className="activity-timeline-row__status-icon activity-timeline-row__status-icon--complete" />
					)}
				</span>

				{/* Type Icon */}
				{Icon && <Icon className="activity-timeline-row__type-icon" />}

				{/* Title / Description */}
				<span className="activity-timeline-row__title" title={activity.title}>
					{activity.title}
				</span>

				{/* Diff additions/deletions if available */}
				{activity.type === 'edit' && <DiffStats detail={activity.detail} />}

				{/* Right side metadata: duration */}
				{activity.durationMs !== undefined && activity.durationMs > 0 && (
					<span className="activity-timeline-row__duration">
						{formatActivityDuration(activity.durationMs)}
					</span>
				)}

				{/* Expand chevron if detail exists */}
				{hasDetail && (
					<IconChevron
						className={`activity-timeline-row__chevron${expanded ? ' is-open' : ''}`}
					/>
				)}
			</div>

			{/* Expandable Level 2 Details */}
			{expanded && hasDetail && (
				<div className="activity-timeline-row__details">
					{activity.detail?.filePath && (
						<div className="activity-timeline-row__detail-item">
							<span className="activity-timeline-row__detail-key">Path:</span>
							<code className="activity-timeline-row__detail-val activity-timeline-row__detail-code">
								{activity.detail.filePath}
								{activity.detail.startLine !== undefined && `:${activity.detail.startLine}`}
								{activity.detail.endLine !== undefined && `-${activity.detail.endLine}`}
							</code>
						</div>
					)}

					{activity.detail?.instruction && (
						<div className="activity-timeline-row__detail-item">
							<span className="activity-timeline-row__detail-key">Instruction:</span>
							<span className="activity-timeline-row__detail-val">
								{activity.detail.instruction}
							</span>
						</div>
					)}

					{activity.detail?.query && (
						<div className="activity-timeline-row__detail-item">
							<span className="activity-timeline-row__detail-key">Query:</span>
							<span className="activity-timeline-row__detail-val">
								{activity.detail.query}
							</span>
						</div>
					)}

					{activity.detail?.directory && (
						<div className="activity-timeline-row__detail-item">
							<span className="activity-timeline-row__detail-key">Directory:</span>
							<span className="activity-timeline-row__detail-val">
								{activity.detail.directory}
							</span>
						</div>
					)}

					{activity.detail?.diff && (
						<pre className="activity-timeline-row__code-block activity-timeline-row__code-block--diff">
							<code>{activity.detail.diff}</code>
						</pre>
					)}

					{activity.detail?.output && (
						<pre className="activity-timeline-row__code-block activity-timeline-row__code-block--terminal">
							<code>{activity.detail.output}</code>
						</pre>
					)}

					{activity.detail?.error && (
						<div className="activity-timeline-row__error-block">
							<code>{activity.detail.error}</code>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

function GroupedActivityRow({ group }: { group: Extract<GroupedActivity, { kind: 'group' }> }) {
	const [expanded, setExpanded] = useState(false)
	const isRunning = group.status === 'running'
	const isFailed = group.status === 'failed'
	const isRead = group.type === 'read_group'

	return (
		<div className={`activity-timeline-row activity-timeline-row--grouped activity-timeline-row--${group.status}`}>
			<div
				className="activity-timeline-row__header is-clickable"
				onClick={() => setExpanded((prev) => !prev)}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault()
						setExpanded((prev) => !prev)
					}
				}}
			>
				<span className="activity-timeline-row__status" aria-hidden="true">
					{isRunning ? (
						<span className="activity-timeline-row__pulse-dot" />
					) : isFailed ? (
						<IconClose className="activity-timeline-row__status-icon activity-timeline-row__status-icon--error" />
					) : (
						<IconCheck className="activity-timeline-row__status-icon activity-timeline-row__status-icon--complete" />
					)}
				</span>

				{isRead ? (
					<IconFile className="activity-timeline-row__type-icon" />
				) : (
					<IconSearch className="activity-timeline-row__type-icon" />
				)}

				<span className="activity-timeline-row__title">{group.title}</span>

				{group.durationMs !== undefined && group.durationMs > 0 && (
					<span className="activity-timeline-row__duration">
						{formatActivityDuration(group.durationMs)}
					</span>
				)}

				<IconChevron
					className={`activity-timeline-row__chevron${expanded ? ' is-open' : ''}`}
				/>
			</div>

			{expanded && (
				<div className="activity-timeline-row__nested-items">
					{group.items.map((item) => (
						<div key={item.id} className="activity-timeline-row__nested-item">
							<span className="activity-timeline-row__nested-dot" aria-hidden="true" />
							<span className="activity-timeline-row__nested-path" title={item.detail?.filePath || item.title}>
								{item.detail?.filePath || item.title}
							</span>
							{item.durationMs !== undefined && item.durationMs > 0 && (
								<span className="activity-timeline-row__nested-duration">
									{formatActivityDuration(item.durationMs)}
								</span>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export function ActivityTimeline({
	timeline,
	isLive = false,
	defaultExpanded,
}: ActivityTimelineProps) {
	const [userToggled, setUserToggled] = useState(false)
	const [expanded, setExpanded] = useState<boolean>(() => {
		if (defaultExpanded !== undefined) return defaultExpanded
		return isLive
	})

	const [now, setNow] = useState(Date.now())

	// If it's live and the user hasn't manually collapsed it, keep it expanded
	useEffect(() => {
		if (isLive && !userToggled) {
			setExpanded(true)
		}
	}, [isLive, userToggled])

	// Live timer ticker for active turn
	useEffect(() => {
		if (!isLive || timeline.status !== 'running') return
		const interval = setInterval(() => setNow(Date.now()), 250)
		return () => clearInterval(interval)
	}, [isLive, timeline.status])

	const elapsedMs =
		timeline.status === 'running'
			? Math.max(0, now - timeline.startedAt)
			: timeline.durationMs ?? Math.max(0, (timeline.completedAt ?? now) - timeline.startedAt)

	const isRunning = timeline.status === 'running'
	const isError = timeline.status === 'error'

	const grouped = useMemo(
		() => groupActivities(timeline.activities),
		[timeline.activities],
	)

	const headerLabel = formatThoughtHeader(
		timeline.status,
		elapsedMs > 0 ? elapsedMs : undefined,
		timeline.activities.length,
	)

	const handleToggle = () => {
		setUserToggled(true)
		setExpanded((prev) => !prev)
	}

	return (
		<div
			className={`activity-timeline${isRunning ? ' activity-timeline--running' : ' activity-timeline--complete'}${isError ? ' activity-timeline--error' : ''}`}
			role="region"
			aria-label="Agent Activity Timeline"
		>
			{/* Level 1: Collapsible Header */}
			<button
				type="button"
				className="activity-timeline__header"
				onClick={handleToggle}
				aria-expanded={expanded}
			>
				<span className="activity-timeline__header-left">
					<span
						className={`activity-timeline__dot${isRunning ? ' activity-timeline__dot--running' : isError ? ' activity-timeline__dot--error' : ' activity-timeline__dot--complete'}`}
						aria-hidden="true"
					>
						{!isRunning && !isError && <IconCheck className="activity-timeline__header-check" />}
					</span>
					<span className="activity-timeline__header-label">{headerLabel}</span>
				</span>

				<span className="activity-timeline__header-right">
					{isRunning && elapsedMs > 0 && (
						<span className="activity-timeline__elapsed">
							{formatActivityDuration(elapsedMs)}
						</span>
					)}
					<IconChevron
						className={`activity-timeline__header-chevron${expanded ? ' is-open' : ''}`}
					/>
				</span>
			</button>

			{/* Level 1: Expanded Body */}
			{expanded && (
				<div className="activity-timeline__body">
					{grouped.length === 0 && isRunning && (
						<div className="activity-timeline__empty-live">
							<span className="activity-timeline-row__pulse-dot" />
							<span className="activity-timeline__empty-text">Starting agent turn...</span>
						</div>
					)}

					{grouped.map((item) => {
						if (item.kind === 'group') {
							return <GroupedActivityRow key={item.id} group={item} />
						}
						return <SingleActivityRow key={item.activity.id} activity={item.activity} />
					})}
				</div>
			)}
		</div>
	)
}
