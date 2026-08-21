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

export type TokenBreakdown = {
	inputTokens: number
	outputTokens: number
	thinkingTokens: number
	totalTokens: number
	cacheReadTokens?: number
}

export type SessionQuotaInfo = {
	inputTokens: number
	outputTokens: number
	thinkingTokens: number
	totalTokens: number
	turnsCount: number
	messagesCount: number
	tokenLimit: number
	tokensRemaining: number
	percentUsed: number
	activeModel?: string
	updatedAt?: string
}

export type WeeklyQuotaInfo = {
	inputTokens: number
	outputTokens: number
	thinkingTokens: number
	totalTokens: number
	promptsCount: number
	tokenLimit: number
	tokensRemaining: number
	percentUsed: number
	resetAt: string
	resetSeconds: number
}

export type AgyQuotaUsage = {
	available: boolean
	version?: string
	authenticated?: boolean
	message?: string
	totalTokens: TokenBreakdown
	activeSessionTokens?: TokenBreakdown
	sessionQuota?: SessionQuotaInfo
	weeklyQuota?: WeeklyQuotaInfo
	activeModel?: string
	availableModels: string[]
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


