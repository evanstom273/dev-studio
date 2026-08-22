import type {
	ActivityTimelineItem,
	AgentActivityItem,
	ConversationItem,
	TurnToolEntry,
} from '@shared/types/agent'

const LIVE_STATUS_ID = 'turn-status-active'

export function shouldRenderActivityTimeline(
	timeline: ActivityTimelineItem,
	isLive = false,
): boolean {
	if (isLive) return true
	if (timeline.activities.length > 0 || Boolean(timeline.entries?.length)) return true
	return timeline.status === 'running'
}

export function filterConversationItems(items: ConversationItem[]): ConversationItem[] {
	return items.filter((item) => {
		if (item.kind !== 'activity_timeline') return true
		return shouldRenderActivityTimeline(item)
	})
}

export function upsertLiveStatusActivity(
	activities: AgentActivityItem[],
	label: string,
	tool?: TurnToolEntry,
): AgentActivityItem[] {
	const title = tool?.label?.trim() || label.trim()
	if (!title || title === 'Done') {
		return activities.filter((activity) => activity.id !== LIVE_STATUS_ID)
	}

	const existing = activities.find((activity) => activity.id === LIVE_STATUS_ID)
	if (existing) {
		return activities.map((activity) =>
			activity.id === LIVE_STATUS_ID
				? { ...activity, title, status: 'running' as const }
				: activity,
		)
	}

	return [
		...activities,
		{
			id: LIVE_STATUS_ID,
			type: 'status',
			status: 'running',
			title,
			startedAt: Date.now(),
		},
	]
}

export function clearLiveStatusActivity(activities: AgentActivityItem[]): AgentActivityItem[] {
	return activities.filter((activity) => activity.id !== LIVE_STATUS_ID)
}
