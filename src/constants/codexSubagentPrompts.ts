/** Prepended to the user message on send; not shown in the composer or chat bubble. */
export const IMPLEMENT_WITH_SUBAGENTS_HIDDEN_PROMPT =
	'Use Codex subagents to implement this task in parallel. First identify genuinely independent workstreams and assign each subagent a clear, non-overlapping area of ownership. Allow subagents to edit the workspace. Avoid assigning multiple agents to the same files where practical. Wait for all subagents to finish, review and integrate their changes, resolve any conflicts or integration issues, then run the appropriate build/tests and fix failures before reporting completion.'

export const PARALLELIZE_WITH_SUBAGENTS_PROMPT =
	'Use Codex subagents to parallelize independent parts of this task. Spawn one subagent per independent workstream, wait for results, then synthesize.'

export const RESEARCH_SUBAGENT_PROMPT =
	'Spawn a research subagent to investigate options in parallel while you continue implementation here.'
