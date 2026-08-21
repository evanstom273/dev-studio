import type { TokenUsage } from '@shared/types/agent'

export type AggregatedTool = {
	name: string
	count: number
	totalDurationMs: number
}

export type LiveTurnStatus = {
	status: 'running' | 'complete'
	label: string
	startedAt: number
	durationMs?: number
	usage?: TokenUsage
	tokensPerSecond?: number
	tools: AggregatedTool[]
}

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`
	const seconds = ms / 1000
	if (seconds < 60) return `${seconds.toFixed(1)}s`
	const minutes = Math.floor(seconds / 60)
	const remainder = Math.round(seconds % 60)
	return `${minutes}m ${remainder}s`
}

export function formatTokenCount(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
	if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
	return String(value)
}

export function formatTurnMeta(status: LiveTurnStatus, nowMs: number): string {
	const parts: string[] = []
	const elapsed =
		status.status === 'complete' && status.durationMs !== undefined
			? status.durationMs
			: Math.max(0, nowMs - status.startedAt)
	parts.push(formatDuration(elapsed))

	const tps = status.tokensPerSecond
	if (tps !== undefined && tps > 0) {
		parts.push(`${Math.round(tps)} t/s`)
	}

	const usage = status.usage
	if (usage?.inputTokens !== undefined) {
		parts.push(`${formatTokenCount(usage.inputTokens)} in`)
	}
	if (usage?.outputTokens !== undefined) {
		parts.push(`${formatTokenCount(usage.outputTokens)} out`)
	}
	if (usage?.thinkingTokens !== undefined && usage.thinkingTokens > 0) {
		parts.push(`${formatTokenCount(usage.thinkingTokens)} think`)
	}

	return parts.join(' · ')
}

export function mergeTurnStatus(
	current: LiveTurnStatus | null,
	event: {
		status: 'running' | 'complete'
		label: string
		durationMs?: number
		usage?: TokenUsage
		tokensPerSecond?: number
		tool?: { name: string; label: string; durationMs?: number }
	},
): LiveTurnStatus {
	const startedAt = current?.startedAt ?? Date.now()
	const tools = [...(current?.tools ?? [])]

	if (event.tool) {
		const existing = tools.find((tool) => tool.name === event.tool!.name)
		if (existing) {
			existing.count += 1
			existing.totalDurationMs += event.tool.durationMs ?? 0
		} else {
			tools.push({
				name: event.tool.name,
				count: 1,
				totalDurationMs: event.tool.durationMs ?? 0,
			})
		}
	}

	return {
		status: event.status,
		label: event.label,
		startedAt,
		durationMs: event.durationMs ?? current?.durationMs,
		usage: event.usage ?? current?.usage,
		tokensPerSecond: event.tokensPerSecond ?? current?.tokensPerSecond,
		tools,
	}
}
