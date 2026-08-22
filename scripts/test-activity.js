import test from 'node:test'
import assert from 'node:assert/strict'

// Test grouping logic
function groupActivities(activities) {
	const result = []
	let i = 0

	while (i < activities.length) {
		const current = activities[i]

		// Group consecutive reads
		if (current.type === 'read') {
			const reads = [current]
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
				const status = isRunning ? 'running' : hasFailed ? 'failed' : 'completed'
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
			const searches = [current]
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
				const status = isRunning ? 'running' : hasFailed ? 'failed' : 'completed'
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

function formatActivityDuration(ms) {
	if (ms === undefined || ms < 0) return ''
	if (ms < 1000) return `${ms}ms`
	const sec = ms / 1000
	if (sec < 60) return `${sec.toFixed(1)}s`
	const min = Math.floor(sec / 60)
	const rem = Math.round(sec % 60)
	return `${min}m ${rem}s`
}

function formatThoughtHeader(status, durationMs, activeCount) {
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

test('formatActivityDuration works for milliseconds, seconds, minutes', () => {
	assert.equal(formatActivityDuration(250), '250ms')
	assert.equal(formatActivityDuration(4200), '4.2s')
	assert.equal(formatActivityDuration(47000), '47.0s')
	assert.equal(formatActivityDuration(134000), '2m 14s')
})

test('formatThoughtHeader produces accurate headers', () => {
	assert.equal(formatThoughtHeader('running'), 'Thinking...')
	assert.equal(formatThoughtHeader('running', 14000), 'Thinking... (14.0s)')
	assert.equal(formatThoughtHeader('complete', 134000), 'Thought for 2m 14s')
	assert.equal(formatThoughtHeader('complete', 4200), 'Thought for 4.2s')
	assert.equal(formatThoughtHeader('error', 8500), 'Error after 8.5s')
})

test('groupActivities groups consecutive reads but keeps edits and commands separate', () => {
	const activities = [
		{ id: '1', type: 'read', status: 'completed', title: 'Read WorkspacePage.tsx', durationMs: 100 },
		{ id: '2', type: 'read', status: 'completed', title: 'Read Navigation.tsx', durationMs: 120 },
		{ id: '3', type: 'read', status: 'completed', title: 'Read agentApi.ts', durationMs: 80 },
		{ id: '4', type: 'search', status: 'completed', title: 'Searched for "GitHub conflict handling"' },
		{ id: '5', type: 'status', status: 'completed', title: 'Implementing Problems service' },
		{ id: '6', type: 'edit', status: 'completed', title: 'Edited problemService.ts', detail: { additions: 184, deletions: 0 } },
		{ id: '7', type: 'edit', status: 'completed', title: 'Edited problem.ts', detail: { additions: 63, deletions: 0 } },
		{ id: '8', type: 'command', status: 'completed', title: '$ npm run build:server', durationMs: 4200 },
		{ id: '9', type: 'status', status: 'running', title: 'Wiring Problems into GitHub...' },
	]

	const grouped = groupActivities(activities)

	assert.equal(grouped.length, 7)
	// Item 0: Grouped reads
	assert.equal(grouped[0].kind, 'group')
	assert.equal(grouped[0].title, 'Read 3 files')
	assert.equal(grouped[0].durationMs, 300)
	assert.equal(grouped[0].items.length, 3)

	// Item 1: Search
	assert.equal(grouped[1].kind, 'single')
	assert.equal(grouped[1].activity.title, 'Searched for "GitHub conflict handling"')

	// Item 2: Status
	assert.equal(grouped[2].kind, 'single')
	assert.equal(grouped[2].activity.title, 'Implementing Problems service')

	// Item 3: Edit 1
	assert.equal(grouped[3].kind, 'single')
	assert.equal(grouped[3].activity.title, 'Edited problemService.ts')

	// Item 4: Edit 2
	assert.equal(grouped[4].kind, 'single')
	assert.equal(grouped[4].activity.title, 'Edited problem.ts')

	// Item 5: Command
	assert.equal(grouped[5].kind, 'single')
	assert.equal(grouped[5].activity.title, '$ npm run build:server')
	assert.equal(grouped[5].activity.durationMs, 4200)

	// Item 6: Active Status
	assert.equal(grouped[6].kind, 'single')
	assert.equal(grouped[6].activity.status, 'running')
})

test('Single read is not grouped into "Read 1 files"', () => {
	const activities = [
		{ id: '1', type: 'read', status: 'completed', title: 'Read WorkspacePage.tsx', durationMs: 100 },
	]
	const grouped = groupActivities(activities)
	assert.equal(grouped.length, 1)
	assert.equal(grouped[0].kind, 'single')
	assert.equal(grouped[0].activity.title, 'Read WorkspacePage.tsx')
})
