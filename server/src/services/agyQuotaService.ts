import { getAccessToken, CredentialError } from 'agy-cli-usage/dist/src/credentials.js'
import { fromApi } from 'agy-cli-usage/dist/src/quota.js'
import type { AgyQuotaSnapshot, QuotaBucket, QuotaGroup } from '../types/system.js'

export type FetchAgyQuotaOptions = {
	agyPath: string
	refresh?: boolean
}

const CLOUD_CODE_HOSTS = [
	'daily-cloudcode-pa.googleapis.com',
	'cloudcode-pa.googleapis.com',
] as const

const CACHE_TTL_MS = 5 * 60_000

type CachedQuota = {
	ts: number
	snapshot: AgyQuotaSnapshot
}

let cachedQuota: CachedQuota | null = null

type SnapshotLike = ReturnType<typeof fromApi>

function toPercent(fraction: number | null | undefined): number | null {
	if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return null
	return Math.max(0, Math.min(100, Math.round(fraction * 100)))
}

function mapBucket(raw: {
	kind: string
	label: string
	remainingFraction: number | null
	usedFraction: number | null
	resetAt: string | null
	resetsInSeconds: number | null
	available: boolean
	description: string | null
}): QuotaBucket {
	const percentRemaining = raw.available ? 100 : toPercent(raw.remainingFraction)
	const percentUsed =
		percentRemaining === null ? null : raw.available ? 0 : Math.max(0, 100 - percentRemaining)

	return {
		kind: raw.kind,
		label: raw.label,
		remainingFraction: raw.remainingFraction,
		usedFraction: raw.usedFraction,
		percentRemaining,
		percentUsed,
		resetAt: raw.resetAt,
		resetSeconds: raw.resetsInSeconds,
		available: raw.available,
		description: raw.description,
	}
}

function mapSnapshot(snapshot: SnapshotLike): AgyQuotaSnapshot {
	return {
		account: snapshot.account,
		tier: snapshot.tier,
		fetchedAt: snapshot.fetchedAt,
		source: snapshot.source,
		host: snapshot.host,
		note: snapshot.note,
		groups: snapshot.groups.map(
			(group): QuotaGroup => ({
				name: group.name,
				models: group.models,
				buckets: group.buckets.map(mapBucket),
			}),
		),
	}
}

function extractEmail(uri: unknown): string | null {
	if (typeof uri !== 'string' || !uri) return null
	const match = uri.match(/[?&]Email=([^&]+)/)
	if (!match?.[1]) return null
	try {
		return decodeURIComponent(match[1])
	} catch {
		return match[1]
	}
}

function extractProject(raw: Record<string, unknown>): string | null {
	const candidates = [
		raw.cloudaicompanionProject,
		raw.cloudAiCompanionProject,
		raw.cloud_aicompanion_project,
	]
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim()) {
			return candidate.trim()
		}
	}
	return null
}

function extractGroups(raw: unknown): unknown[] | null {
	if (!raw || typeof raw !== 'object') return null
	const record = raw as Record<string, unknown>

	const direct = record.groups
	if (Array.isArray(direct)) return direct

	for (const wrapperKey of ['response', 'summary'] as const) {
		const wrapper = record[wrapperKey]
		if (!wrapper || typeof wrapper !== 'object') continue
		const nested = (wrapper as Record<string, unknown>).groups
		if (Array.isArray(nested)) return nested
	}

	return null
}

function hasQuotaGroups(raw: unknown): boolean {
	const groups = extractGroups(raw)
	return Array.isArray(groups) && groups.length > 0
}

async function postInternal(
	host: string,
	accessToken: string,
	method: string,
	body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const response = await fetch(`https://${host}/v1internal:${method}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			'User-Agent': 'dev-studio-quota/0.2.0',
		},
		body: JSON.stringify(body),
	})

	if (!response.ok) {
		const detail = (await response.text()).slice(0, 300)
		const error = new Error(`${method} -> HTTP ${response.status}: ${detail}`)
		;(error as Error & { status?: number }).status = response.status
		throw error
	}

	return (await response.json()) as Record<string, unknown>
}

async function fetchQuotaViaApi(accessToken: string): Promise<SnapshotLike> {
	let lastError: Error | null = null

	for (const host of CLOUD_CODE_HOSTS) {
		let tier: string | null = null
		let account: string | null = null
		let project: string | null = null

		try {
			const loadAssist = await postInternal(host, accessToken, 'loadCodeAssist', {
				metadata: { ideType: 'ANTIGRAVITY' },
			})
			project = extractProject(loadAssist)
			const currentTier = loadAssist.currentTier
			if (currentTier && typeof currentTier === 'object') {
				const tierRecord = currentTier as Record<string, unknown>
				tier = typeof tierRecord.id === 'string' ? tierRecord.id : null
				account = extractEmail(tierRecord.upgradeSubscriptionUri)
			}
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
			const status = (error as Error & { status?: number }).status
			if (status === 401 || status === 403) {
				throw lastError
			}
		}

		const quotaBodies: Record<string, unknown>[] = project ? [{ project }] : [{}, { project: '' }]

		for (const body of quotaBodies) {
			try {
				const raw = await postInternal(host, accessToken, 'retrieveUserQuotaSummary', body)
				if (!hasQuotaGroups(raw)) continue

				return fromApi({
					raw: raw as Parameters<typeof fromApi>[0]['raw'],
					host,
					account,
					tier,
				})
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))
				const status = (error as Error & { status?: number }).status
				if (status === 401 || status === 403) {
					throw lastError
				}
			}
		}
	}

	throw lastError ?? new Error('Antigravity quota API returned no usable data')
}

function formatQuotaError(error: unknown): Error {
	if (error instanceof CredentialError) {
		return new Error(
			'Antigravity is not signed in on this laptop. Run `agy` in PowerShell, sign in, then refresh.',
		)
	}

	if (!(error instanceof Error)) {
		return new Error('Failed to fetch Antigravity quota')
	}

	if (/401|403|unauthorized|invalid authentication/i.test(error.message)) {
		return new Error(
			'Antigravity session expired. Run `agy` on the laptop, sign in again, then refresh.',
		)
	}

	if (/no cloudaicompanionProject|returned no quota groups|no usable data/i.test(error.message)) {
		return new Error(
			'Antigravity quota API did not return project quota. Run `agy`, open `/usage` once to refresh your account, then retry.',
		)
	}

	return error
}

export async function fetchAgyQuota(options: FetchAgyQuotaOptions): Promise<AgyQuotaSnapshot> {
	void options.agyPath

	if (!options.refresh && cachedQuota && Date.now() - cachedQuota.ts < CACHE_TTL_MS) {
		return cachedQuota.snapshot
	}

	try {
		const { accessToken } = await getAccessToken()
		const snapshot = mapSnapshot(await fetchQuotaViaApi(accessToken))
		cachedQuota = { ts: Date.now(), snapshot }
		return snapshot
	} catch (error) {
		throw formatQuotaError(error)
	}
}

export function summarizeQuotaHealth(snapshot: AgyQuotaSnapshot | undefined): {
	exhausted: boolean
	low: boolean
	worstRemainingPercent: number | null
} {
	if (!snapshot?.groups.length) {
		return { exhausted: false, low: false, worstRemainingPercent: null }
	}

	let worstRemainingPercent: number | null = null

	for (const group of snapshot.groups) {
		for (const bucket of group.buckets) {
			if (bucket.available) continue
			const remaining = bucket.percentRemaining
			if (remaining === null) continue
			if (worstRemainingPercent === null || remaining < worstRemainingPercent) {
				worstRemainingPercent = remaining
			}
		}
	}

	if (worstRemainingPercent === null) {
		return { exhausted: false, low: false, worstRemainingPercent: null }
	}

	return {
		exhausted: worstRemainingPercent <= 0,
		low: worstRemainingPercent <= 15,
		worstRemainingPercent,
	}
}
