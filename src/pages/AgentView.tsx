import { useCallback, useEffect, useState } from 'react'
import type { AgentMode, ConversationItem, PermissionRequest, StreamEvent } from '@shared/types/agent'
import type { Project } from '@shared/types/project'
import { AgentStatusBar } from '../components/AgentStatusBar'
import { Conversation } from '../components/Conversation'
import { ModeSelector } from '../components/ModeSelector'
import { PermissionPrompt } from '../components/PermissionPrompt'
import { PromptComposer } from '../components/PromptComposer'
import { useVisualViewport } from '../hooks/useVisualViewport'
import { agentApi } from '../services/agentApi'
import { RUN_COMMANDS } from '../types/index'
import { mergeTurnStatus, type LiveTurnStatus } from '../utils/turnStatus'
import '../styles/agent.css'

type AgentViewProps = {
	project: Project
}

export function AgentView({ project }: AgentViewProps) {
	const [items, setItems] = useState<ConversationItem[]>([])
	const [prompt, setPrompt] = useState('')
	const [mode, setMode] = useState<AgentMode>('agent')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([])
	const [turnStatus, setTurnStatus] = useState<LiveTurnStatus | null>(null)
	const viewport = useVisualViewport()

	const loadSession = useCallback(async () => {
		try {
			const session = await agentApi.getSession(project.id)
			setItems(session.items)
			setMode(session.mode)
		} catch {
			setItems([])
		}
	}, [project.id])

	useEffect(() => {
		void loadSession()
	}, [loadSession])

	const appendActivity = (label: string, status: 'running' | 'complete' | 'error') => {
		setItems((prev) => [
			...prev,
			{
				id: `act-${Date.now()}-${Math.random()}`,
				kind: 'activity',
				status,
				label,
				timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			},
		])
	}

	const handleSend = async () => {
		const trimmed = prompt.trim()
		if (!trimmed || loading) return

		setLoading(true)
		setError(null)
		setPrompt('')
		setTurnStatus(null)

		const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		setItems((prev) => [
			...prev,
			{ id: `msg-${Date.now()}`, kind: 'message', role: 'user', content: trimmed, timestamp: now, mode },
		])

		let agentBuffer = ''
		let agentItemId: string | null = null

		try {
			await agentApi.sendMessage({ projectId: project.id, content: trimmed, mode }, (raw) => {
				const event = raw as StreamEvent
				if (event.type === 'message_delta') {
					agentBuffer += event.content
					if (!agentItemId) {
						agentItemId = `msg-agent-${Date.now()}`
						setItems((prev) => [
							...prev,
							{
								id: agentItemId!,
								kind: 'message',
								role: 'agent',
								content: agentBuffer,
								timestamp: now,
								mode,
							},
						])
					} else {
						setItems((prev) =>
							prev.map((item) =>
								item.id === agentItemId ? { ...item, content: agentBuffer } : item,
							),
						)
					}
				}
				if (event.type === 'turn_status') {
					setTurnStatus((prev) => mergeTurnStatus(prev, event))
				}
				if (event.type === 'activity') {
					appendActivity(event.label, event.status)
				}
				if (event.type === 'permission_request') {
					setPermissionRequests((prev) => {
						if (prev.some((p) => p.id === event.permission.id)) return prev
						return [...prev, event.permission]
					})
				}
				if (event.type === 'error') {
					setError(event.message)
				}
				if (event.type === 'done') {
					setTurnStatus((prev) =>
						prev
							? mergeTurnStatus(prev, {
									status: 'complete',
									label: 'Done',
									durationMs: event.durationMs ?? prev.durationMs,
									usage: event.usage ?? prev.usage,
									tokensPerSecond: event.tokensPerSecond ?? prev.tokensPerSecond,
								})
							: null,
					)
				}
			})
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to send message')
		} finally {
			setLoading(false)
			void loadSession()
			setTimeout(() => setTurnStatus(null), 2500)
		}
	}

	const runCommand = async (command: string, label: string) => {
		appendActivity(label, 'running')
		try {
			const result = await agentApi.runCommand({ projectId: project.id, command, label })
			appendActivity(
				result.exitCode === 0 ? `${label} passed` : `${label} failed (exit ${result.exitCode})`,
				result.exitCode === 0 ? 'complete' : 'error',
			)
		} catch (err) {
			appendActivity(err instanceof Error ? err.message : 'Command failed', 'error')
		}
	}

	const clearChat = async () => {
		if (loading) return
		if (!confirm('Clear this chat? The conversation history will be reset.')) return

		setLoading(true)
		setError(null)
		setPermissionRequests([])
		setTurnStatus(null)
		try {
			const session = await agentApi.resetSession(project.id)
			setItems(session.items)
			setMode(session.mode)
			setPrompt('')
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to clear chat')
		} finally {
			setLoading(false)
		}
	}

	const shellStyle = viewport.keyboardOpen
		? { height: `${viewport.height}px`, transform: `translateY(${viewport.offsetTop}px)` }
		: undefined

	return (
		<div className="workspace-pane agent-view" style={shellStyle}>
			<div className="agent-toolbar">
				<div className="agent-toolbar__row">
					<ModeSelector mode={mode} onChange={setMode} disabled={loading} />
					<button
						type="button"
						className="btn btn--ghost btn--sm"
						onClick={() => void clearChat()}
						disabled={loading || items.length === 0}
					>
						Clear chat
					</button>
				</div>
				<div className="agent-toolbar__commands">
					{RUN_COMMANDS.map((cmd) => (
						<button
							key={cmd.id}
							type="button"
							className="btn btn--ghost btn--sm"
							onClick={() => void runCommand(cmd.command, cmd.label)}
							disabled={loading}
						>
							{cmd.label}
						</button>
					))}
				</div>
			</div>

			<AgentStatusBar status={turnStatus} />
			<Conversation items={items} />
			{error && <div className="agent-error">{error}</div>}
			<PermissionPrompt projectId={project.id} incoming={permissionRequests} />
			<PromptComposer
				value={prompt}
				onChange={setPrompt}
				onSend={() => void handleSend()}
				keyboardOpen={viewport.keyboardOpen}
			/>
		</div>
	)
}
