import type { ActivityTimelineItem, AgentActivityItem, AgentTimelineEntry } from '@shared/types/agent'

export function getTimelineEntries(timeline: ActivityTimelineItem): AgentTimelineEntry[] {
	if (timeline.entries?.length) return timeline.entries
	return timeline.activities.map((activity) => ({
		id: `entry-${activity.id}`,
		kind: 'activity' as const,
		activityId: activity.id,
		createdAt: activity.startedAt,
	}))
}

export function getTimelineActivity(timeline: ActivityTimelineItem, activityId: string): AgentActivityItem | undefined {
	return timeline.activities.find((activity) => activity.id === activityId)
}
