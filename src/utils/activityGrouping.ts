import type { AgentActivityItem, AgentActivityStatus } from '@shared/types/agent'

export type GroupedActivity =
	| {
			kind: 'single'
			activity: AgentActivityItem
	  }
	| {
			kind: 'group'
			type: 'read_group' | 'search_group'
			id: string
			title: string
			status: AgentActivityStatus
			durationMs?: number
			items: AgentActivityItem[]
	  }

export function groupActivities(activities: AgentActivityItem[]): GroupedActivity[] {
	const result: GroupedActivity[] = []
	let i = 0

	while (i < activities.length) {
		const current = activities[i]

		// Group consecutive reads
		if (current.type === 'read') {
			const reads: AgentActivityItem[] = [current]
			let j = i + 1
			while (j < activities.length && activities[j].type === 'read') {
				reads.push(activities[j])
				j++
			}

			if (reads.length === 1) {
				result.push({ kind: 'single', activity: reads[0] })
			} else {
				const isRunning = reads.some((r) => r.status === 'running')
				const hasFailed = reads.some((r) => r.status === 'failed')
				const status: AgentActivityStatus = isRunning
					? 'running'
					: hasFailed
						? 'failed'
						: 'completed'
				const totalDuration = reads.reduce((acc, r) => acc + (r.durationMs ?? 0), 0)

				result.push({
					kind: 'group',
					type: 'read_group',
					id: `read-group-${reads[0].id}`,
					title: `Read ${reads.length} files`,
					status,
					durationMs: totalDuration > 0 ? totalDuration : undefined,
					items: reads,
				})
			}
			i = j
			continue
		}

		// Group consecutive searches if more than 1
		if (current.type === 'search') {
			const searches: AgentActivityItem[] = [current]
			let j = i + 1
			while (j < activities.length && activities[j].type === 'search') {
				searches.push(activities[j])
				j++
			}

			if (searches.length === 1) {
				result.push({ kind: 'single', activity: searches[0] })
			} else {
				const isRunning = searches.some((s) => s.status === 'running')
				const hasFailed = searches.some((s) => s.status === 'failed')
				const status: AgentActivityStatus = isRunning
					? 'running'
					: hasFailed
						? 'failed'
						: 'completed'
				const totalDuration = searches.reduce((acc, s) => acc + (s.durationMs ?? 0), 0)

				result.push({
					kind: 'group',
					type: 'search_group',
					id: `search-group-${searches[0].id}`,
					title: `Searched ${searches.length} queries`,
					status,
					durationMs: totalDuration > 0 ? totalDuration : undefined,
					items: searches,
				})
			}
			i = j
			continue
		}

		// Standalone activity (edit, command, git, status, error, tool)
		result.push({ kind: 'single', activity: current })
		i++
	}

	return result
}

export function formatActivityDuration(ms?: number): string {
	if (ms === undefined || ms < 0) return ''
	if (ms < 1000) return `${ms}ms`
	const sec = ms / 1000
	if (sec < 60) return `${sec.toFixed(1)}s`
	const min = Math.floor(sec / 60)
	const rem = Math.round(sec % 60)
	return `${min}m ${rem}s`
}

export function formatThoughtHeader(
	status: 'running' | 'complete' | 'error',
	durationMs?: number,
	activeCount?: number,
): string {
	if (status === 'running') {
		if (durationMs !== undefined && durationMs >= 1000) {
			return `Thinking... (${formatActivityDuration(durationMs)})`
		}
		return 'Thinking...'
	}

	if (status === 'error') {
		if (durationMs !== undefined && durationMs > 0) {
			return `Error after ${formatActivityDuration(durationMs)}`
		}
		return 'Error'
	}

	if (durationMs !== undefined && durationMs > 0) {
		return `Thought for ${formatActivityDuration(durationMs)}`
	}

	if (activeCount !== undefined && activeCount > 0) {
		return `Thought for ${activeCount} step${activeCount === 1 ? '' : 's'}`
	}

	return 'Thought completed'
}
