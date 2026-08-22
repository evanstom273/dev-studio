import type { ProviderStatusInfo } from './agent.js'

export type ServerUpdateStep = {
	name: string
	exitCode: number
	stdout: string
	stderr: string
}

export type ServerUpdateResult = {
	ok: boolean
	restarting: boolean
	installPath: string
	steps: ServerUpdateStep[]
	restartLogPath?: string
	error?: string
}

export type QuotaBucket = {
	kind: string
	label: string
	remainingFraction: number | null
	usedFraction: number | null
	percentRemaining: number | null
	percentUsed: number | null
	resetAt: string | null
	resetSeconds: number | null
	available: boolean
	description: string | null
}

export type QuotaGroup = {
	name: string
	models: string
	buckets: QuotaBucket[]
}

export type AgyQuotaSnapshot = {
	account: string | null
	tier: string | null
	fetchedAt: string
	source: 'api' | 'pty' | 'local'
	host: string | null
	note: string | null
	groups: QuotaGroup[]
}

export type AgyQuotaUsage = {
	available: boolean
	version?: string
	authenticated?: boolean
	message?: string
	quota?: AgyQuotaSnapshot
	quotaError?: string
	quotaHealth?: {
		exhausted: boolean
		low: boolean
		worstRemainingPercent: number | null
	}
	codexQuota?: AgyQuotaSnapshot
	codexQuotaError?: string
	codexQuotaHealth?: {
		exhausted: boolean
		low: boolean
		worstRemainingPercent: number | null
	}
	activeModel?: string
	availableModels: string[]
	providers?: ProviderStatusInfo[]
	laptopStats?: {
		freeMemBytes: number
		totalMemBytes: number
		usedMemBytes: number
		memoryUsagePercent: number
		uptimeSeconds: number
		platform: string
		nodeVersion: string
	}
}
