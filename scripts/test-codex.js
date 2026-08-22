import test from 'node:test'
import assert from 'node:assert/strict'

function buildCodexExecArgs(options) {
	const args = []
	const isResume = Boolean(options.threadId)

	if (isResume) {
		args.push('exec', 'resume', options.threadId, '--json', '--skip-git-repo-check')
	} else {
		args.push('exec', '--json', '--skip-git-repo-check')
	}

	if (options.model) {
		const cleanModel = options.model.replace(/^(codex|openai):/, '')
		args.push('-m', cleanModel)
	}

	if (options.reasoningEffort) {
		args.push('-c', `model_reasoning_effort="${options.reasoningEffort}"`)
	}

	if (options.speed) {
		args.push('-c', `service_tier="${options.speed}"`)
	}

	const sandboxMode = options.mode === 'agent' ? 'workspace-write' : 'read-only'
	if (isResume) {
		args.push('-c', `sandbox_mode="${sandboxMode}"`)
	} else {
		args.push('-s', sandboxMode)
	}

	args.push('-')
	return args
}

function formatWindowLabel(windowMinutes, fallback = 'Usage Window') {
	if (!windowMinutes || windowMinutes <= 0) return fallback
	const hours = windowMinutes / 60
	if (hours < 24) {
		return `${Math.round(hours)}h Window`
	}
	const days = Math.round(hours / 24)
	if (days === 7) return 'Weekly Window (7d)'
	return `${days}d Window`
}

function parseCodexRateLimits(payload, planType, accountName, nowMs = Date.now()) {
	const effectivePlan = payload.plan_type || planType || 'plus'
	const buckets = []

	if (payload.primary) {
		const percentUsed = typeof payload.primary.used_percent === 'number'
			? Math.max(0, Math.min(100, Math.round(payload.primary.used_percent)))
			: null
		const percentRemaining = percentUsed === null ? null : Math.max(0, 100 - percentUsed)
		const remainingFraction = percentRemaining === null ? null : percentRemaining / 100
		const usedFraction = percentUsed === null ? null : percentUsed / 100

		let resetAt = null
		let resetSeconds = null
		if (payload.primary.resets_at && payload.primary.resets_at > 0) {
			const resetMs = payload.primary.resets_at * 1000
			resetAt = new Date(resetMs).toISOString()
			resetSeconds = Math.max(0, Math.round((resetMs - nowMs) / 1000))
		}

		const windowLabel = formatWindowLabel(payload.primary.window_minutes, 'Primary Quota')
		buckets.push({
			kind: 'primary',
			label: windowLabel === 'Weekly Window (7d)' ? 'Weekly Limit' : `Primary (${windowLabel})`,
			remainingFraction,
			usedFraction,
			percentRemaining,
			percentUsed,
			resetAt,
			resetSeconds,
			available: percentRemaining === null
				? !payload.rate_limit_reached_type
				: percentRemaining > 0 && !payload.rate_limit_reached_type,
			description: payload.primary.window_minutes
				? `${windowLabel} – resets ${resetAt ? new Date(resetAt).toLocaleString() : 'soon'}`
				: null,
		})
	}

	if (payload.secondary) {
		const percentUsed = typeof payload.secondary.used_percent === 'number'
			? Math.max(0, Math.min(100, Math.round(payload.secondary.used_percent)))
			: null
		const percentRemaining = percentUsed === null ? null : Math.max(0, 100 - percentUsed)
		const remainingFraction = percentRemaining === null ? null : percentRemaining / 100
		const usedFraction = percentUsed === null ? null : percentUsed / 100

		let resetAt = null
		let resetSeconds = null
		if (payload.secondary.resets_at && payload.secondary.resets_at > 0) {
			const resetMs = payload.secondary.resets_at * 1000
			resetAt = new Date(resetMs).toISOString()
			resetSeconds = Math.max(0, Math.round((resetMs - nowMs) / 1000))
		}

		const windowLabel = formatWindowLabel(payload.secondary.window_minutes, 'Secondary Quota')
		buckets.push({
			kind: 'secondary',
			label: `Secondary (${windowLabel})`,
			remainingFraction,
			usedFraction,
			percentRemaining,
			percentUsed,
			resetAt,
			resetSeconds,
			available: percentRemaining === null ? true : percentRemaining > 0,
			description: payload.secondary.window_minutes
				? `${windowLabel} – resets ${resetAt ? new Date(resetAt).toLocaleString() : 'soon'}`
				: null,
		})
	}

	if (
		payload.credits &&
		(payload.credits.has_credits ||
			payload.credits.unlimited ||
			(payload.credits.balance && payload.credits.balance !== '0'))
	) {
		buckets.push({
			kind: 'credits',
			label: 'Credits Balance',
			remainingFraction: payload.credits.unlimited ? 1 : null,
			usedFraction: null,
			percentRemaining: payload.credits.unlimited ? 100 : null,
			percentUsed: null,
			resetAt: null,
			resetSeconds: null,
			available: payload.credits.unlimited || (payload.credits.balance !== '0' && payload.credits.has_credits),
			description: payload.credits.unlimited
				? 'Unlimited usage credits enabled'
				: `Balance: ${payload.credits.balance || '0'}`,
		})
	}

	if (buckets.length === 0) {
		buckets.push({
			kind: 'standard',
			label: 'Codex Standard Quota',
			remainingFraction: 1,
			usedFraction: 0,
			percentRemaining: 100,
			percentUsed: 0,
			resetAt: null,
			resetSeconds: null,
			available: true,
			description: 'Active subscription ready for turns',
		})
	}

	const groups = [
		{
			name: `Codex ${effectivePlan.toUpperCase()}`,
			models: 'gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.4',
			buckets,
		},
	]

	return {
		account: accountName || 'ChatGPT Account',
		tier: effectivePlan.toUpperCase(),
		fetchedAt: new Date(nowMs).toISOString(),
		source: 'local',
		host: 'localhost',
		note: payload.rate_limit_reached_type ? `Limit reached: ${payload.rate_limit_reached_type}` : null,
		groups,
	}
}

test('buildCodexExecArgs: new session in agent mode uses workspace-write sandbox', () => {
	const args = buildCodexExecArgs({
		threadId: null,
		mode: 'agent',
	})

	assert.deepEqual(args, ['exec', '--json', '--skip-git-repo-check', '-s', 'workspace-write', '-'])
	assert.ok(args.includes('-s'))
	assert.equal(args[args.indexOf('-s') + 1], 'workspace-write')
	assert.ok(!args.includes('read-only'))
})

test('buildCodexExecArgs: new session in ask mode uses read-only sandbox', () => {
	const args = buildCodexExecArgs({
		threadId: null,
		mode: 'ask',
	})

	assert.deepEqual(args, ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '-'])
	assert.ok(args.includes('-s'))
	assert.equal(args[args.indexOf('-s') + 1], 'read-only')
	assert.ok(!args.includes('workspace-write'))
})

test('buildCodexExecArgs: new session in plan mode uses read-only sandbox', () => {
	const args = buildCodexExecArgs({
		threadId: null,
		mode: 'plan',
	})

	assert.deepEqual(args, ['exec', '--json', '--skip-git-repo-check', '-s', 'read-only', '-'])
	assert.ok(args.includes('-s'))
	assert.equal(args[args.indexOf('-s') + 1], 'read-only')
	assert.ok(!args.includes('workspace-write'))
})

test('buildCodexExecArgs: resumed session in agent mode sets sandbox_mode="workspace-write" via -c', () => {
	const threadId = '01a027f1-3b7e-7471-9710-6cc0d734810e'
	const args = buildCodexExecArgs({
		threadId,
		mode: 'agent',
	})

	assert.deepEqual(args, [
		'exec',
		'resume',
		threadId,
		'--json',
		'--skip-git-repo-check',
		'-c',
		'sandbox_mode="workspace-write"',
		'-',
	])
	// Must NOT use -s on resume since codex exec resume rejects -s
	assert.ok(!args.includes('-s'))
	assert.ok(args.includes('sandbox_mode="workspace-write"'))
})

test('buildCodexExecArgs: resumed session in ask mode sets sandbox_mode="read-only" via -c', () => {
	const threadId = '01a027f1-3b7e-7471-9710-6cc0d734810e'
	const args = buildCodexExecArgs({
		threadId,
		mode: 'ask',
	})

	assert.deepEqual(args, [
		'exec',
		'resume',
		threadId,
		'--json',
		'--skip-git-repo-check',
		'-c',
		'sandbox_mode="read-only"',
		'-',
	])
	assert.ok(!args.includes('-s'))
	assert.ok(args.includes('sandbox_mode="read-only"'))
})

test('buildCodexExecArgs: resumed session in plan mode sets sandbox_mode="read-only" via -c', () => {
	const threadId = '01a027f1-3b7e-7471-9710-6cc0d734810e'
	const args = buildCodexExecArgs({
		threadId,
		mode: 'plan',
	})

	assert.deepEqual(args, [
		'exec',
		'resume',
		threadId,
		'--json',
		'--skip-git-repo-check',
		'-c',
		'sandbox_mode="read-only"',
		'-',
	])
	assert.ok(!args.includes('-s'))
	assert.ok(args.includes('sandbox_mode="read-only"'))
})

test('buildCodexExecArgs: cleanly applies model, reasoning effort, and speed tier options', () => {
	const args = buildCodexExecArgs({
		threadId: null,
		model: 'codex:gpt-5.6-sol',
		reasoningEffort: 'high',
		speed: 'fast',
		mode: 'agent',
	})

	assert.deepEqual(args, [
		'exec',
		'--json',
		'--skip-git-repo-check',
		'-m',
		'gpt-5.6-sol',
		'-c',
		'model_reasoning_effort="high"',
		'-c',
		'service_tier="fast"',
		'-s',
		'workspace-write',
		'-',
	])
})

test('parseCodexRateLimits: formats rate limits into valid quota groups and buckets', () => {
	const nowMs = 1787376500000
	const snapshot = parseCodexRateLimits(
		{
			limit_id: 'codex',
			plan_type: 'plus',
			primary: {
				used_percent: 1.0,
				window_minutes: 10080,
				resets_at: 1787978986,
			},
			credits: {
				has_credits: false,
				unlimited: false,
				balance: '0',
			},
		},
		'plus',
		'acc_12345',
		nowMs,
	)

	assert.equal(snapshot.tier, 'PLUS')
	assert.equal(snapshot.account, 'acc_12345')
	assert.equal(snapshot.groups.length, 1)
	assert.equal(snapshot.groups[0].name, 'Codex PLUS')
	assert.equal(snapshot.groups[0].buckets.length, 1)

	const primary = snapshot.groups[0].buckets[0]
	assert.equal(primary.kind, 'primary')
	assert.equal(primary.percentUsed, 1)
	assert.equal(primary.percentRemaining, 99)
	assert.equal(primary.remainingFraction, 0.99)
	assert.equal(primary.usedFraction, 0.01)
	assert.equal(primary.available, true)
	assert.equal(primary.label, 'Weekly Limit')
	assert.ok(primary.resetAt !== null)
	assert.ok(primary.resetSeconds !== null && primary.resetSeconds > 0)
})

test('parseCodexRateLimits: handles secondary bucket and credits when present', () => {
	const nowMs = 1787376500000
	const snapshot = parseCodexRateLimits(
		{
			plan_type: 'pro',
			primary: {
				used_percent: 25,
				window_minutes: 10080,
				resets_at: 1787978986,
			},
			secondary: {
				used_percent: 80,
				window_minutes: 1440,
				resets_at: 1787462900,
			},
			credits: {
				has_credits: true,
				unlimited: false,
				balance: '150.00',
			},
		},
		'pro',
		'test-user',
		nowMs,
	)

	assert.equal(snapshot.tier, 'PRO')
	assert.equal(snapshot.groups[0].buckets.length, 3)

	const primary = snapshot.groups[0].buckets[0]
	assert.equal(primary.percentUsed, 25)
	assert.equal(primary.percentRemaining, 75)

	const secondary = snapshot.groups[0].buckets[1]
	assert.equal(secondary.percentUsed, 80)
	assert.equal(secondary.percentRemaining, 20)

	const credits = snapshot.groups[0].buckets[2]
	assert.equal(credits.kind, 'credits')
	assert.equal(credits.available, true)
	assert.ok(credits.description?.includes('150.00'))
})

test('parseCodexRateLimits: preserves quota availability when usage percentage is absent', () => {
	const snapshot = parseCodexRateLimits({
		primary: { window_minutes: 10080 },
	})
	const primary = snapshot.groups[0].buckets[0]

	assert.equal(primary.label, 'Weekly Limit')
	assert.equal(primary.percentUsed, null)
	assert.equal(primary.percentRemaining, null)
	assert.equal(primary.remainingFraction, null)
	assert.equal(primary.usedFraction, null)
	assert.equal(primary.available, true)
})
