import { getSnapshot, type SnapshotOptions } from 'agy-cli-usage'
import type { AgyQuotaSnapshot, QuotaBucket, QuotaGroup } from '../types/system.js'

export type FetchAgyQuotaOptions = {
	agyPath: string
	refresh?: boolean
}

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

function mapSnapshot(snapshot: Awaited<ReturnType<typeof getSnapshot>>): AgyQuotaSnapshot {
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

export async function fetchAgyQuota(options: FetchAgyQuotaOptions): Promise<AgyQuotaSnapshot> {
	const previousAgyBin = process.env.AGY_BIN
	process.env.AGY_BIN = options.agyPath

	const snapshotOptions: SnapshotOptions = {
		source: 'auto',
		channel: 'auto',
		cache: !options.refresh,
	}

	try {
		const snapshot = await getSnapshot(snapshotOptions)
		return mapSnapshot(snapshot)
	} finally {
		if (previousAgyBin === undefined) {
			delete process.env.AGY_BIN
		} else {
			process.env.AGY_BIN = previousAgyBin
		}
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
