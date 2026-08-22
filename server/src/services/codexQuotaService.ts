import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AgyQuotaSnapshot, QuotaBucket, QuotaGroup } from '../types/system.js'

export interface CodexRateLimitsPayload {
	limit_id?: string | null
	limit_name?: string | null
	primary?: {
		used_percent?: number | null
		window_minutes?: number | null
		resets_at?: number | null
	} | null
	secondary?: {
		used_percent?: number | null
		window_minutes?: number | null
		resets_at?: number | null
	} | null
	credits?: {
		has_credits?: boolean
		unlimited?: boolean
		balance?: string | null
	} | null
	plan_type?: string | null
	rate_limit_reached_type?: string | null
}

let latestMemoryRateLimits: CodexRateLimitsPayload | null = null
let cachedSnapshot: { snapshot: AgyQuotaSnapshot; timestamp: number } | null = null

export function setLatestCodexRateLimits(rateLimits: CodexRateLimitsPayload): void {
	latestMemoryRateLimits = rateLimits
	cachedSnapshot = null
}

function formatWindowLabel(windowMinutes?: number | null, fallback = 'Usage Window'): string {
	if (!windowMinutes || windowMinutes <= 0) return fallback
	const hours = windowMinutes / 60
	if (hours < 24) {
		return `${Math.round(hours)}h Window`
	}
	const days = Math.round(hours / 24)
	if (days === 7) return 'Weekly Window (7d)'
	return `${days}d Window`
}

export function parseCodexRateLimits(
	payload: CodexRateLimitsPayload,
	planType?: string | null,
	accountName?: string | null,
	nowMs = Date.now(),
): AgyQuotaSnapshot {
	const effectivePlan = payload.plan_type || planType || 'plus'
	const buckets: QuotaBucket[] = []

	if (payload.primary) {
		const percentUsed = typeof payload.primary.used_percent === 'number'
			? Math.max(0, Math.min(100, Math.round(payload.primary.used_percent)))
			: null
		const percentRemaining = percentUsed === null ? null : Math.max(0, 100 - percentUsed)
		const remainingFraction = percentRemaining === null ? null : percentRemaining / 100
		const usedFraction = percentUsed === null ? null : percentUsed / 100

		let resetAt: string | null = null
		let resetSeconds: number | null = null
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

		let resetAt: string | null = null
		let resetSeconds: number | null = null
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
			available: Boolean(
				payload.credits.unlimited ||
					(payload.credits.balance && payload.credits.balance !== '0' && payload.credits.has_credits),
			),
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

	const groups: QuotaGroup[] = [
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

async function findLatestRolloutFiles(baseDir: string, maxFiles = 30): Promise<string[]> {
	if (!existsSync(baseDir)) return []
	const results: Array<{ path: string; mtime: number }> = []

	async function walk(dir: string, depth = 0): Promise<void> {
		if (depth > 5) return
		try {
			const entries = await readdir(dir, { withFileTypes: true })
			for (const entry of entries) {
				const fullPath = join(dir, entry.name)
				if (entry.isDirectory()) {
					await walk(fullPath, depth + 1)
				} else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
					try {
						const s = await stat(fullPath)
						results.push({ path: fullPath, mtime: s.mtimeMs })
					} catch {
						// ignore
					}
				}
			}
		} catch {
			// ignore
		}
	}

	await walk(baseDir)
	results.sort((a, b) => b.mtime - a.mtime)
	return results.slice(0, maxFiles).map((r) => r.path)
}

async function extractRateLimitsFromLatestRollout(): Promise<{
	rateLimits: CodexRateLimitsPayload
	planType?: string
} | null> {
	const sessionsDir = join(homedir(), '.codex', 'sessions')
	const files = await findLatestRolloutFiles(sessionsDir, 20)

	for (const file of files) {
		try {
			const content = await readFile(file, 'utf8')
			const lines = content.split('\n')
			// Read in reverse to get the latest token_count in the session
			for (let i = lines.length - 1; i >= 0; i--) {
				const line = lines[i]?.trim()
				if (!line || !line.includes('rate_limits')) continue

				try {
					const parsed = JSON.parse(line) as {
						payload?: { rate_limits?: CodexRateLimitsPayload }
						info?: { rate_limits?: CodexRateLimitsPayload }
						rate_limits?: CodexRateLimitsPayload
					}
					const rateLimits = parsed.payload?.rate_limits || parsed.info?.rate_limits || parsed.rate_limits
					if (rateLimits && (rateLimits.primary || rateLimits.credits || rateLimits.plan_type)) {
						return {
							rateLimits,
							planType: rateLimits.plan_type || undefined,
						}
					}
				} catch {
					// ignore json parse error
				}
			}
		} catch {
			// ignore file read error
		}
	}

	return null
}

export async function fetchCodexQuota(options: { refresh?: boolean } = {}): Promise<AgyQuotaSnapshot | null> {
	const now = Date.now()
	if (!options.refresh && cachedSnapshot && now - cachedSnapshot.timestamp < 30000) {
		return cachedSnapshot.snapshot
	}

	let planType: string | null = null
	let accountId: string | null = null

	try {
		const authPath = join(homedir(), '.codex', 'auth.json')
		if (existsSync(authPath)) {
			const rawAuth = await readFile(authPath, 'utf8')
			const authObj = JSON.parse(rawAuth) as {
				tokens?: { account_id?: string; plan_type?: string }
				auth_mode?: string
			}
			accountId = authObj.tokens?.account_id || (authObj.auth_mode ? `Signed in (${authObj.auth_mode})` : null)
			planType = authObj.tokens?.plan_type || null
		}
	} catch {
		// ignore
	}

	let rateLimits = latestMemoryRateLimits
	if (!rateLimits || options.refresh) {
		const extracted = await extractRateLimitsFromLatestRollout()
		if (extracted) {
			rateLimits = extracted.rateLimits
			if (extracted.planType) {
				planType = extracted.planType
			}
			latestMemoryRateLimits = rateLimits
		}
	}

	if (!rateLimits) {
		// If no session has run yet, return a clean baseline if signed in
		if (accountId) {
			const fallback = parseCodexRateLimits(
				{
					plan_type: planType || 'plus',
					primary: { used_percent: 0, window_minutes: 10080 },
				},
				planType,
				accountId,
				now,
			)
			cachedSnapshot = { snapshot: fallback, timestamp: now }
			return fallback
		}
		return null
	}

	const snapshot = parseCodexRateLimits(rateLimits, planType, accountId, now)
	cachedSnapshot = { snapshot, timestamp: now }
	return snapshot
}
