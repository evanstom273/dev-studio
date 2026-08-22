import type { ActivityTimelineItem, AgentActivityItem } from '../../types/agent.js'

export function appendTimelineCommentary(timeline: ActivityTimelineItem, content: string): void {
	const text = content.trim()
	if (!text) return
	const entries = timeline.entries ?? (timeline.entries = timeline.activities.map((activity) => ({
		id: `entry-${activity.id}`,
		kind: 'activity' as const,
		activityId: activity.id,
		createdAt: activity.startedAt,
	})))
	const last = entries[entries.length - 1]
	if (last?.kind === 'commentary') {
		last.content = `${last.content}${last.content ? '\n' : ''}${text}`
		return
	}
	entries.push({ id: `commentary-${Date.now()}-${entries.length}`, kind: 'commentary', content: text, createdAt: Date.now() })
}

export function appendTimelineActivity(timeline: ActivityTimelineItem, activity: AgentActivityItem): void {
	if (!timeline.activities.some((item) => item.id === activity.id)) timeline.activities.push(activity)
	const entries = timeline.entries ?? (timeline.entries = timeline.activities.slice(0, -1).map((item) => ({
		id: `entry-${item.id}`,
		kind: 'activity' as const,
		activityId: item.id,
		createdAt: item.startedAt,
	})))
	if (!entries.some((entry) => entry.kind === 'activity' && entry.activityId === activity.id)) {
		entries.push({ id: `entry-${activity.id}`, kind: 'activity', activityId: activity.id, createdAt: activity.startedAt })
	}
}

export function updateTimelineActivity(timeline: ActivityTimelineItem, activity: AgentActivityItem): void {
	const index = timeline.activities.findIndex((item) => item.id === activity.id)
	if (index >= 0) timeline.activities[index] = activity
	else appendTimelineActivity(timeline, activity)
}
