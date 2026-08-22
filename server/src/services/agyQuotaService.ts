import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
	CredentialError,
	decodeSecret,
	getAccessToken,
} from 'agy-cli-usage/dist/src/credentials.js'
import { fetchLocalAgyQuota } from './agyLocalQuotaService.js'
import { extractQuotaGroups, hasUsableQuotaGroups, parseQuotaGroups } from './agyQuotaParse.js'
import type { AgyQuotaSnapshot } from '../types/system.js'

export type FetchAgyQuotaOptions = {
	agyPath: string
	refresh?: boolean
}

const CLOUD_CODE_HOSTS = [
	'daily-cloudcode-pa.googleapis.com',
	'cloudcode-pa.googleapis.com',
] as const

const CACHE_TTL_MS = 5 * 60_000
const TOKEN_FILE = join(homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token')

type CachedQuota = {
	ts: number
	snapshot: AgyQuotaSnapshot
}

let cachedQuota: CachedQuota | null = null

async function resolveAccessToken(forceRefresh = false): Promise<string> {
	if (!forceRefresh) {
		try {
			const { accessToken } = await getAccessToken()
			if (accessToken) return accessToken
		} catch {
			// fall through to token file retry
		}
	}

	if (existsSync(TOKEN_FILE)) {
		try {
			const raw = readFileSync(TOKEN_FILE, 'utf8').trim()
			const cred = decodeSecret(raw)
			if (cred.accessToken) return cred.accessToken
		} catch {
			// fall through
		}
	}

	const { accessToken } = await getAccessToken()
	return accessToken
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
	for (const key of ['cloudaicompanionProject', 'cloudAiCompanionProject', 'cloud_aicompanion_project']) {
		const value = raw[key]
		if (typeof value === 'string' && value.trim()) return value.trim()
	}
	return null
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
			'User-Agent': 'antigravity/1.11.3 dev-studio-quota',
		},
		body: JSON.stringify(body),
	})

	if (!response.ok) {
		const detail = (await response.text()).slice(0, 300)
		const error = new Error(`${method}@${host} -> HTTP ${response.status}: ${detail}`)
		;(error as Error & { status?: number }).status = response.status
		throw error
	}

	return (await response.json()) as Record<string, unknown>
}

async function fetchCloudQuota(accessToken: string): Promise<AgyQuotaSnapshot> {
	const nowMs = Date.now()
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
			if (status === 401 || status === 403) throw lastError
		}

		const quotaBodies: Record<string, unknown>[] = [{ }]
		if (project) quotaBodies.unshift({ project })

		for (const body of quotaBodies) {
			try {
				const raw = await postInternal(host, accessToken, 'retrieveUserQuotaSummary', body)
				const groups = parseQuotaGroups(raw, nowMs)
				if (!hasUsableQuotaGroups(groups)) {
					if (!extractQuotaGroups(raw)?.length) continue
					lastError = new Error('retrieveUserQuotaSummary returned groups without quota fractions')
					continue
				}

				return {
					account,
					tier,
					fetchedAt: new Date(nowMs).toISOString(),
					source: 'api',
					host,
					note: null,
					groups,
				}
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))
				const status = (error as Error & { status?: number }).status
				if (status === 401 || status === 403) throw lastError
			}
		}
	}

	throw lastError ?? new Error('Antigravity cloud quota API returned no usable data')
}

function formatQuotaError(error: unknown): Error {
	if (error instanceof CredentialError) {
		return new Error(
			'Antigravity credentials not readable. Keep `agy` open and signed in, or run `agy` once in PowerShell to refresh login.',
		)
	}

	if (!(error instanceof Error)) {
		return new Error('Failed to fetch Antigravity quota')
	}

	if (/401|403|unauthorized|invalid authentication/i.test(error.message)) {
		return new Error(
			'Antigravity session expired. Run `agy` in PowerShell, sign in again, leave it open, then refresh.',
		)
	}

	if (/no usable data|without quota fractions|timed out/i.test(error.message)) {
		return new Error(
			'Could not read quota. Leave `agy` running and signed in (same laptop), open `/usage` once, then tap Refresh All.',
		)
	}

	return error
}

export async function fetchAgyQuota(options: FetchAgyQuotaOptions): Promise<AgyQuotaSnapshot> {
	void options.agyPath

	if (!options.refresh && cachedQuota && Date.now() - cachedQuota.ts < CACHE_TTL_MS) {
		return cachedQuota.snapshot
	}

	const errors: string[] = []

	try {
		const local = await fetchLocalAgyQuota()
		if (local) {
			cachedQuota = { ts: Date.now(), snapshot: local }
			return local
		}
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error))
	}

	try {
		let accessToken = await resolveAccessToken(false)
		try {
			const snapshot = await fetchCloudQuota(accessToken)
			cachedQuota = { ts: Date.now(), snapshot }
			return snapshot
		} catch (firstError) {
			const status = (firstError as Error & { status?: number }).status
			if (status === 401 || status === 403) {
				accessToken = await resolveAccessToken(true)
				const snapshot = await fetchCloudQuota(accessToken)
				cachedQuota = { ts: Date.now(), snapshot }
				return snapshot
			}
			throw firstError
		}
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error))
		throw formatQuotaError(new Error(errors.join(' | ')))
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
