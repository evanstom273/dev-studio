import type { AgentActivityItem, AgentActivityType, AgentMode } from '../../types/agent.js'

export type CodexStreamItem = {
	id?: string
	type?: string
	text?: string
	command?: string
	aggregated_output?: string
	exit_code?: number | null
	status?: string
	message?: string
	path?: string
	file_path?: string
	action?: string
	query?: string
	url?: string
	name?: string
	server?: string
	tool?: string
	additions?: number
	deletions?: number
}

function classifyCommand(command: string): AgentActivityType {
	const trimmed = command.trim()
	if (/^(git|gh)\b/i.test(trimmed)) return 'git'
	return 'command'
}

function formatCommandTitle(command: string): string {
	const trimmed = command.trim()
	if (/^git\s+commit/i.test(trimmed)) return 'Committed changes'
	if (/^git\s+push/i.test(trimmed)) return 'Pushed changes'
	if (/^git\s+pull/i.test(trimmed)) return 'Pulled changes'
	if (/^git\s+checkout/i.test(trimmed)) return 'Checked out branch'
	if (/^git\s+branch/i.test(trimmed)) return 'Managed branches'
	if (/^gh\s+pr/i.test(trimmed)) return 'Created or updated PR'
	if (/^gh\s+issue/i.test(trimmed)) return 'Managed GitHub issue'
	return trimmed.startsWith('$') ? trimmed : `$ ${trimmed}`
}

function formatFileChangeTitle(item: CodexStreamItem): string {
	const path = item.path || item.file_path || 'file'
	const action = (item.action || 'edit').toLowerCase()
	if (action.includes('create') || action.includes('add')) return `Created ${path}`
	if (action.includes('delete') || action.includes('remove')) return `Deleted ${path}`
	return `Edited ${path}`
}

export function isCodexCommentaryItemType(type: string | undefined): boolean {
	return type === 'reasoning' || type === 'agent_reasoning' || type === 'commentary' || type === 'progress'
}

export function createRunningActivityFromCodexItem(
	item: CodexStreamItem,
	mode: AgentMode,
): AgentActivityItem | null {
	const id = item.id || `act-${Date.now()}`
	const type = item.type || ''

	if (type === 'command_execution') {
		const command = item.command || 'command'
		if (mode === 'ask') return null
		return {
			id,
			type: classifyCommand(command),
			status: 'running',
			title: formatCommandTitle(command),
			detail: { command },
			startedAt: Date.now(),
			toolName: 'bash',
		}
	}

	if (type === 'file_change') {
		if (mode === 'ask' || mode === 'plan') return null
		const path = item.path || item.file_path
		return {
			id,
			type: 'edit',
			status: 'running',
			title: formatFileChangeTitle(item),
			detail: {
				filePath: path,
				additions: item.additions,
				deletions: item.deletions,
				action: item.action,
			},
			startedAt: Date.now(),
			toolName: 'edit',
		}
	}

	if (type === 'web_search') {
		return {
			id,
			type: 'search',
			status: 'running',
			title: item.query ? `Searched "${item.query}"` : 'Web search',
			detail: { query: item.query, summary: item.url },
			startedAt: Date.now(),
			toolName: 'search',
		}
	}

	if (type === 'mcp_tool_call') {
		if (mode === 'ask') return null
		const label = item.name || item.tool || item.server || 'tool'
		return {
			id,
			type: 'tool',
			status: 'running',
			title: `Called ${label}`,
			detail: { summary: item.message },
			startedAt: Date.now(),
			toolName: label,
		}
	}

	return null
}

export function finalizeActivityFromCodexItem(
	existing: AgentActivityItem | undefined,
	item: CodexStreamItem,
	mode: AgentMode,
): AgentActivityItem | null {
	const type = item.type || ''

	if (type === 'command_execution') {
		const command = item.command || existing?.detail?.command || 'command'
		if (mode === 'ask') return null
		const isSuccess = item.exit_code === 0 || item.exit_code === null || item.exit_code === undefined
		return {
			id: item.id || existing?.id || `act-${Date.now()}`,
			type: classifyCommand(command),
			status: isSuccess ? 'completed' : 'failed',
			title: formatCommandTitle(command),
			detail: {
				command,
				output: item.aggregated_output,
				exitCode: item.exit_code ?? undefined,
				error: isSuccess ? undefined : item.message || `Exit code ${item.exit_code}`,
			},
			startedAt: existing?.startedAt ?? Date.now(),
			completedAt: Date.now(),
			durationMs: existing ? Date.now() - existing.startedAt : 0,
			toolName: 'bash',
		}
	}

	if (type === 'file_change') {
		if (mode === 'ask' || mode === 'plan') return null
		const path = item.path || item.file_path || existing?.detail?.filePath
		return {
			id: item.id || existing?.id || `act-${Date.now()}`,
			type: 'edit',
			status: 'completed',
			title: formatFileChangeTitle(item),
			detail: {
				filePath: path,
				additions: item.additions,
				deletions: item.deletions,
				action: item.action,
			},
			startedAt: existing?.startedAt ?? Date.now(),
			completedAt: Date.now(),
			durationMs: existing ? Date.now() - existing.startedAt : 0,
			toolName: 'edit',
		}
	}

	if (type === 'web_search') {
		return {
			id: item.id || existing?.id || `act-${Date.now()}`,
			type: 'search',
			status: 'completed',
			title: item.query ? `Searched "${item.query}"` : 'Web search',
			detail: { query: item.query, summary: item.url || item.text },
			startedAt: existing?.startedAt ?? Date.now(),
			completedAt: Date.now(),
			durationMs: existing ? Date.now() - existing.startedAt : 0,
			toolName: 'search',
		}
	}

	if (type === 'mcp_tool_call') {
		if (mode === 'ask') return null
		const label = item.name || item.tool || item.server || 'tool'
		const failed = item.status === 'failed' || item.status === 'error'
		return {
			id: item.id || existing?.id || `act-${Date.now()}`,
			type: failed ? 'error' : 'tool',
			status: failed ? 'failed' : 'completed',
			title: failed ? `Failed: ${label}` : `Called ${label}`,
			detail: { summary: item.message || item.text, error: failed ? item.message : undefined },
			startedAt: existing?.startedAt ?? Date.now(),
			completedAt: Date.now(),
			durationMs: existing ? Date.now() - existing.startedAt : 0,
			toolName: label,
		}
	}

	if (type === 'error') {
		const message = item.message || item.text || 'Tool error'
		if (message.includes('context budget') || message.includes('descriptions were shortened')) {
			return null
		}
		return {
			id: item.id || existing?.id || `act-${Date.now()}`,
			type: 'error',
			status: 'failed',
			title: message,
			detail: { error: message },
			startedAt: existing?.startedAt ?? Date.now(),
			completedAt: Date.now(),
			durationMs: 0,
		}
	}

	return null
}
