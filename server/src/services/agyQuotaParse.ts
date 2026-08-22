import type { QuotaBucket, QuotaGroup } from '../types/system.js'

type RawRecord = Record<string, unknown>

function asRecord(value: unknown): RawRecord | null {
	return value && typeof value === 'object' ? (value as RawRecord) : null
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function extractQuotaGroups(raw: unknown): RawRecord[] | null {
	const record = asRecord(raw)
	if (!record) return null

	const direct = record.groups
	if (Array.isArray(direct)) {
		return direct.filter((group): group is RawRecord => asRecord(group) !== null)
	}

	for (const wrapperKey of ['response', 'summary'] as const) {
		const wrapper = asRecord(record[wrapperKey])
		const nested = wrapper?.groups
		if (Array.isArray(nested)) {
			return nested.filter((group): group is RawRecord => asRecord(group) !== null)
		}
	}

	return null
}

function remainingFraction(bucket: RawRecord): number | null {
	for (const key of ['remainingFraction', 'remaining_fraction'] as const) {
		const value = asNumber(bucket[key])
		if (value !== null) return Math.max(0, Math.min(1, value))
	}

	const remaining = asRecord(bucket.remaining)
	if (!remaining) return null

	for (const key of ['remainingFraction', 'remaining_fraction'] as const) {
		const value = asNumber(remaining[key])
		if (value !== null) return Math.max(0, Math.min(1, value))
	}

	if (asString(remaining.case) === 'remainingFraction') {
		const value = asNumber(remaining.value)
		if (value !== null) return Math.max(0, Math.min(1, value))
	}

	return null
}

function bucketKind(bucket: RawRecord): string {
	const label = [
		asString(bucket.bucketId),
		asString(bucket.id),
		asString(bucket.displayName),
		asString(bucket.name),
		asString(bucket.window),
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase()

	if (label.includes('week') || label.includes('7d')) return 'weekly'
	if (label.includes('5') && label.includes('hour')) return '5h'
	if (label.includes('session')) return '5h'
	if (asString(bucket.window) === 'weekly') return 'weekly'
	if (asString(bucket.window) === '5h') return '5h'
	return asString(bucket.displayName) ?? asString(bucket.window) ?? 'quota'
}

function resetAt(bucket: RawRecord): string | null {
	for (const key of ['resetTime', 'reset_time', 'resetAt', 'reset_at'] as const) {
		const value = asString(bucket[key])
		if (value) return value
	}
	return null
}

function resetSeconds(resetAtValue: string | null, nowMs: number): number | null {
	if (!resetAtValue) return null
	const targetMs = new Date(resetAtValue).getTime()
	if (!Number.isFinite(targetMs)) return null
	return Math.max(0, Math.round((targetMs - nowMs) / 1000))
}

function toPercent(fraction: number | null, available: boolean): number | null {
	if (available) return 100
	if (fraction === null) return null
	return Math.max(0, Math.min(100, Math.round(fraction * 100)))
}

function mapBucket(bucket: RawRecord, nowMs: number): QuotaBucket | null {
	const fraction = remainingFraction(bucket)
	if (fraction === null) return null

	const available = fraction >= 1
	const resetAtValue = resetAt(bucket)
	const percentRemaining = toPercent(fraction, available)

	return {
		kind: bucketKind(bucket),
		label: asString(bucket.displayName) ?? asString(bucket.bucketId) ?? 'Quota',
		remainingFraction: fraction,
		usedFraction: available ? 0 : 1 - fraction,
		percentRemaining,
		percentUsed: percentRemaining === null ? null : 100 - percentRemaining,
		resetAt: resetAtValue,
		resetSeconds: resetSeconds(resetAtValue, nowMs),
		available,
		description: asString(bucket.description),
	}
}

export function parseQuotaGroups(raw: unknown, nowMs = Date.now()): QuotaGroup[] {
	const groups = extractQuotaGroups(raw)
	if (!groups?.length) return []

	const parsed: QuotaGroup[] = []

	for (const group of groups) {
		const bucketsRaw = group.buckets
		if (!Array.isArray(bucketsRaw)) continue

		const buckets: QuotaBucket[] = []
		for (const entry of bucketsRaw) {
			const bucketRecord = asRecord(entry)
			if (!bucketRecord) continue
			const bucket = mapBucket(bucketRecord, nowMs)
			if (bucket) buckets.push(bucket)
		}

		if (!buckets.length) continue

		parsed.push({
			name: asString(group.displayName) ?? asString(group.name) ?? 'Models',
			models: (asString(group.description) ?? '').replace(/^Models within this group:\s*/i, '').trim(),
			buckets,
		})
	}

	return parsed
}

export function hasUsableQuotaGroups(groups: QuotaGroup[]): boolean {
	return groups.some((group) => group.buckets.some((bucket) => bucket.percentRemaining !== null))
}
