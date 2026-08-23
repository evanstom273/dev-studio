import type { AgentActivityItem, AgentActivityStatus, AgentActivityType, AgentMode } from '../../types/agent.js'

export type CodexCollabAgentState = {
	status?: string
	message?: string | null
}

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
	prompt?: string
	sender_thread_id?: string
	receiver_thread_ids?: string[]
	agents_states?: Record<string, CodexCollabAgentState>
}

const COLLAB_TOOL_LABELS: Record<string, string> = {
	spawn_agent: 'Spawn subagent',
	send_input: 'Send to subagent',
	resume_agent: 'Resume subagent',
	wait: 'Wait for subagent',
	close_agent: 'Close subagent',
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

function shortThreadId(threadId: string): string {
	const trimmed = threadId.trim()
	if (trimmed.length <= 10) return trimmed
	return `${trimmed.slice(0, 8)}…`
}

function mapCollabStatus(status: string | undefined, runningDefault: AgentActivityStatus): AgentActivityStatus {
	switch (status) {
		case 'completed':
			return 'completed'
		case 'failed':
			return 'failed'
		case 'in_progress':
			return 'running'
		default:
			return runningDefault
	}
}

function summarizeAgentStates(states: Record<string, CodexCollabAgentState> | undefined): string | undefined {
	if (!states) return undefined
	const entries = Object.entries(states)
	if (entries.length === 0) return undefined
	return entries
		.map(([threadId, state]) => `${shortThreadId(threadId)}: ${state.status || 'unknown'}`)
		.join(', ')
}

function formatCollabTitle(item: CodexStreamItem, activityStatus: AgentActivityStatus): string {
	const tool = item.tool || 'collab'
	const base = COLLAB_TOOL_LABELS[tool] || `Subagent: ${tool.replace(/_/g, ' ')}`
	const receivers = item.receiver_thread_ids?.length ?? 0
	const stateSummary = summarizeAgentStates(item.agents_states)

	if (tool === 'spawn_agent') {
		if (activityStatus === 'running') {
			return item.prompt?.trim()
				? `${base}: ${item.prompt.trim().slice(0, 80)}${item.prompt.trim().length > 80 ? '…' : ''}`
				: `${base}…`
		}
		if (receivers > 0) {
			return `${base} (${receivers} active)`
		}
		return `${base} complete`
	}

	if (tool === 'wait') {
		if (activityStatus === 'running') {
			return receivers > 0 ? `Waiting for ${receivers} subagent${receivers === 1 ? '' : 's'}…` : 'Waiting for subagents…'
		}
		return stateSummary ? `Subagents ready (${stateSummary})` : 'Subagents finished'
	}

	if (tool === 'close_agent') {
		return activityStatus === 'running' ? 'Closing subagent…' : 'Subagent closed'
	}

	if (tool === 'send_input') {
		return activityStatus === 'running' ? 'Sending follow-up to subagent…' : 'Sent follow-up to subagent'
	}

	if (tool === 'resume_agent') {
		return activityStatus === 'running' ? 'Resuming subagent…' : 'Subagent resumed'
	}

	return base
}

function buildCollabActivity(
	item: CodexStreamItem,
	existing: AgentActivityItem | undefined,
	runningDefault: AgentActivityStatus,
): AgentActivityItem | null {
	const tool = item.tool
	if (!tool) return null

	const activityStatus = mapCollabStatus(item.status, runningDefault)
	const receiverThreadIds = item.receiver_thread_ids ?? existing?.detail?.receiverThreadIds
	const agentStates = item.agents_states
		? Object.fromEntries(
				Object.entries(item.agents_states).map(([threadId, state]) => [
					threadId,
					{ status: state.status || 'unknown', message: state.message ?? undefined },
				]),
			)
		: existing?.detail?.agentStates

	return {
		id: item.id || existing?.id || `act-${Date.now()}`,
		type: 'subagent',
		status: activityStatus,
		title: formatCollabTitle(item, activityStatus),
		detail: {
			collabTool: tool,
			instruction: item.prompt?.trim() || existing?.detail?.instruction,
			senderThreadId: item.sender_thread_id || existing?.detail?.senderThreadId,
			receiverThreadIds,
			agentStates,
			summary: summarizeAgentStates(item.agents_states ?? agentStates),
		},
		startedAt: existing?.startedAt ?? Date.now(),
		completedAt: activityStatus === 'running' ? undefined : Date.now(),
		durationMs:
			activityStatus === 'running' || !existing
				? undefined
				: Date.now() - (existing.startedAt ?? Date.now()),
		toolName: tool,
	}
}

export function isCodexCommentaryItemType(type: string | undefined): boolean {
	return type === 'reasoning' || type === 'agent_reasoning' || type === 'commentary' || type === 'progress'
}

export function isCodexToolActivityItemType(type: string | undefined): boolean {
	return (
		type === 'command_execution' ||
		type === 'file_change' ||
		type === 'web_search' ||
		type === 'mcp_tool_call' ||
		type === 'collab_tool_call' ||
		type === 'error'
	)
}

export function createRunningActivityFromCodexItem(
	item: CodexStreamItem,
	mode: AgentMode,
): AgentActivityItem | null {
	const id = item.id || `act-${Date.now()}`
	const type = item.type || ''

	if (type === 'collab_tool_call') {
		if (mode !== 'agent') return null
		return buildCollabActivity(item, undefined, 'running')
	}

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

	if (type === 'collab_tool_call') {
		if (mode !== 'agent') return null
		return buildCollabActivity(item, existing, 'completed')
	}

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
