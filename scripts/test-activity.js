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

function shouldRenderActivityTimeline(timeline, isLive = false) {
	if (isLive) return true
	if (timeline.activities.length > 0) return true
	return timeline.status === 'running'
}

function filterConversationItems(items) {
	return items.filter((item) => {
		if (item.kind !== 'activity_timeline') return true
		return shouldRenderActivityTimeline(item)
	})
}

test('filterConversationItems removes empty completed timelines', () => {
	const items = [
		{ id: 'm1', kind: 'message', role: 'user', content: 'hi' },
		{
			id: 't1',
			kind: 'activity_timeline',
			status: 'complete',
			startedAt: 1000,
			durationMs: 5000,
			activities: [],
		},
		{
			id: 't2',
			kind: 'activity_timeline',
			status: 'complete',
			startedAt: 2000,
			activities: [{ id: 'a1', type: 'read', status: 'completed', title: 'Read file.ts' }],
		},
	]
	const filtered = filterConversationItems(items)
	assert.equal(filtered.length, 2)
	assert.equal(filtered[1].id, 't2')
})

test('filterConversationItems keeps running timelines even when empty', () => {
	const items = [
		{
			id: 't-live',
			kind: 'activity_timeline',
			status: 'running',
			startedAt: Date.now(),
			activities: [],
		},
	]
	const filtered = filterConversationItems(items)
	assert.equal(filtered.length, 1)
})

// ==========================================
// Tests for Processes & Servers Tool Logic
// ==========================================

test('Process backend protection correctly prevents unacknowledged stops', () => {
	const currentBackendPid = 12345
	function canStopProcess(proc, acknowledgeBackend) {
		if (proc.pid === currentBackendPid || proc.isDevStudioBackend) {
			if (!acknowledgeBackend) {
				return { success: false, code: 403, error: 'Protection active' }
			}
		}
		return { success: true }
	}

	const devBackend = { pid: 12345, isDevStudioBackend: true, name: 'Dev Studio Backend' }
	const regularProcess = { pid: 6789, isDevStudioBackend: false, name: 'vite' }

	assert.equal(canStopProcess(devBackend, false).success, false)
	assert.equal(canStopProcess(devBackend, true).success, true)
	assert.equal(canStopProcess(regularProcess, false).success, true)
})

test('Local URL formatting detects standard HTTP and localhost ports', () => {
	function detectUrl(port) {
		return `http://localhost:${port}`
	}
	assert.equal(detectUrl(5173), 'http://localhost:5173')
	assert.equal(detectUrl(3000), 'http://localhost:3000')
	assert.equal(detectUrl(8080), 'http://localhost:8080')
})

// ==========================================
// Tests for Problems & Diagnostics Tool Logic
// ==========================================

test('TypeScript diagnostic regex parses compiler errors', () => {
	const tsLine = `src/components/Icons.tsx(139,17): error TS2323: Cannot redeclare exported variable 'IconStop'.`
	const tsRegex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/
	const match = tsLine.match(tsRegex)

	assert.ok(match)
	assert.equal(match[1], 'src/components/Icons.tsx')
	assert.equal(match[2], '139')
	assert.equal(match[3], '17')
	assert.equal(match[4], 'error')
	assert.equal(match[5], 'TS2323')
	assert.equal(match[6], "Cannot redeclare exported variable 'IconStop'.")
})

test('Problems summary correctly tallies severities and resolution states', () => {
	const problems = [
		{ id: '1', severity: 'error', resolved: false },
		{ id: '2', severity: 'error', resolved: false },
		{ id: '3', severity: 'warning', resolved: false },
		{ id: '4', severity: 'info', resolved: false },
		{ id: '5', severity: 'error', resolved: true },
	]

	function computeSummary(list) {
		const activeList = list.filter((p) => !p.resolved)
		return {
			total: list.length,
			errors: activeList.filter((p) => p.severity === 'error').length,
			warnings: activeList.filter((p) => p.severity === 'warning').length,
			info: activeList.filter((p) => p.severity === 'info').length,
			active: activeList.length,
			resolved: list.filter((p) => p.resolved).length,
		}
	}

	const sum = computeSummary(problems)
	assert.equal(sum.total, 5)
	assert.equal(sum.errors, 2)
	assert.equal(sum.warnings, 1)
	assert.equal(sum.info, 1)
	assert.equal(sum.active, 4)
	assert.equal(sum.resolved, 1)
})

// ==========================================
// Tests for Tasks / Plans Tool Logic
// ==========================================

test('Plan progress calculations handle empty, partial, and completed plans', () => {
	function calcProgress(steps) {
		if (steps.length === 0) return 0
		const done = steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length
		return Math.round((done / steps.length) * 100)
	}

	assert.equal(calcProgress([]), 0)
	assert.equal(
		calcProgress([
			{ status: 'completed' },
			{ status: 'pending' },
		]),
		50,
	)
	assert.equal(
		calcProgress([
			{ status: 'completed' },
			{ status: 'skipped' },
			{ status: 'completed' },
		]),
		100,
	)
})

test('Plan Markdown artifact exporter formats valid markdown structure', () => {
	const plan = {
		id: 'plan-1',
		title: 'Refactor Authentication',
		description: 'Upgrade session store to JWT tokens',
		status: 'in_progress',
		steps: [
			{ id: 's1', title: 'Create JWT helper', file: 'src/jwt.ts', line: 10, status: 'completed' },
			{ id: 's2', title: 'Update middleware', command: 'npm test', status: 'in_progress' },
			{ id: 's3', title: 'Verify frontend session refresh', status: 'pending' },
		],
	}

	function generatePlanMarkdown(p) {
		const lines = [
			`# Task Plan: ${p.title}`,
			'',
			`**Status**: \`${p.status}\``,
			p.description ? `**Goal**: ${p.description}\n` : '',
			'## Steps',
			'',
			...p.steps.map((step, idx) => {
				const check = step.status === 'completed' ? '[x]' : '[ ]'
				const fileInfo = step.file ? ` (File: \`${step.file}${step.line ? `:${step.line}` : ''}\`)` : ''
				const cmdInfo = step.command ? ` (Command: \`${step.command}\`)` : ''
				return `${idx + 1}. ${check} **${step.title}**${fileInfo}${cmdInfo}`
			}),
		]
		return lines.join('\n')
	}

	const md = generatePlanMarkdown(plan)
	assert.ok(md.includes('# Task Plan: Refactor Authentication'))
	assert.ok(md.includes('1. [x] **Create JWT helper** (File: `src/jwt.ts:10`)'))
	assert.ok(md.includes('2. [ ] **Update middleware** (Command: `npm test`)'))
	assert.ok(md.includes('3. [ ] **Verify frontend session refresh**'))
})

