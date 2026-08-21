import { useCallback, useEffect, useState } from 'react'
import type { AgentMode, AttachmentInfo, ConversationItem, PermissionRequest, StreamEvent } from '@shared/types/agent'
import type { Project } from '@shared/types/project'
import { AgentStatusBar } from '../components/AgentStatusBar'
import { Conversation } from '../components/Conversation'
import { PermissionPrompt } from '../components/PermissionPrompt'
import { PromptComposer } from '../components/PromptComposer'
import { agentApi } from '../services/agentApi'
import { RUN_COMMANDS } from '../types/index'
import { mergeTurnStatus, type LiveTurnStatus } from '../utils/turnStatus'
import '../styles/agent.css'

type AgentViewProps = {
	project: Project
	keyboardOpen?: boolean
}

export function AgentView({ project, keyboardOpen = false }: AgentViewProps) {
	const [items, setItems] = useState<ConversationItem[]>([])
	const [prompt, setPrompt] = useState('')
	const [mode, setMode] = useState<AgentMode>('agent')
	const [availableModels, setAvailableModels] = useState<string[]>([])
	const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined)
	const [attachments, setAttachments] = useState<AttachmentInfo[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([])
	const [turnStatus, setTurnStatus] = useState<LiveTurnStatus | null>(null)

	const loadSession = useCallback(async () => {
		try {
			const session = await agentApi.getSession(project.id)
			setItems(session.items)
			setMode(session.mode)
			if (session.model) {
				setSelectedModel(session.model)
			}
		} catch {
			setItems([])
		}
	}, [project.id])

	useEffect(() => {
		void loadSession()
		agentApi
			.getAvailableModels()
			.then((models) => {
				setAvailableModels(models)
			})
			.catch(() => {})
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

	const handleAddAttachments = async (files: FileList | File[]) => {
		const fileArray = Array.from(files)
		for (const file of fileArray) {
			const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
			const isImage = file.type.startsWith('image/')
			const previewUrl = isImage ? URL.createObjectURL(file) : undefined

			let textContent: string | undefined
			const isText =
				file.type.startsWith('text/') ||
				/\.(ts|tsx|js|jsx|json|md|txt|html|css|py|yaml|yml|toml|rs|go|c|cpp|h|java|sql|sh)$/i.test(
					file.name,
				)

			if (isText && file.size < 256 * 1024) {
				try {
					textContent = await file.text()
				} catch {
					// ignore text extraction error
				}
			}

			try {
				const res = await agentApi.uploadAttachment(project.id, file)
				setAttachments((prev) => [
					...prev,
					{
						id,
						name: file.name,
						size: file.size,
						contentType: file.type || 'application/octet-stream',
						relativePath: res.relativePath,
						textContent,
						previewUrl,
					},
				])
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to upload attachment')
			}
		}
	}

	const handleRemoveAttachment = (id: string) => {
		setAttachments((prev) => {
			const target = prev.find((a) => a.id === id)
			if (target?.previewUrl) {
				URL.revokeObjectURL(target.previewUrl)
			}
			return prev.filter((a) => a.id !== id)
		})
	}

	const handleStop = async () => {
		try {
			await agentApi.stopGeneration(project.id)
			setLoading(false)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to stop generation')
		}
	}

	const handleSend = async () => {
		const trimmed = prompt.trim()
		if ((!trimmed && attachments.length === 0) || loading) return

		setLoading(true)
		setError(null)
		setPrompt('')
		setTurnStatus(null)

		const currentAttachments = [...attachments]
		setAttachments([])

		let displayText = trimmed
		if (currentAttachments.length > 0) {
			const attList = currentAttachments.map((a) => `📎 ${a.name}`).join('\n')
			displayText = displayText ? `${displayText}\n\n${attList}` : attList
		}

		let promptWithContext = trimmed
		if (currentAttachments.length > 0) {
			const contextBlocks: string[] = []
			for (const att of currentAttachments) {
				if (att.textContent) {
					contextBlocks.push(
						`[Attached File: ${att.name} (${att.relativePath || ''})]\n\`\`\`\n${att.textContent}\n\`\`\``,
					)
				} else if (att.relativePath) {
					contextBlocks.push(`[Attached File saved at: ${att.relativePath}]`)
				}
			}
			const combinedAttachments = contextBlocks.join('\n\n')
			promptWithContext = promptWithContext
				? `${promptWithContext}\n\n${combinedAttachments}`
				: combinedAttachments
		}

		const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		setItems((prev) => [
			...prev,
			{ id: `msg-${Date.now()}`, kind: 'message', role: 'user', content: displayText, timestamp: now, mode },
		])

		let agentBuffer = ''
		let agentItemId: string | null = null

		try {
			await agentApi.sendMessage(
				{
					projectId: project.id,
					content: promptWithContext,
					mode,
					model: selectedModel,
					attachments: currentAttachments,
				},
				(raw) => {
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
				},
			)
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
			setAttachments([])
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to clear chat')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div
			className={`workspace-pane agent-view${keyboardOpen ? ' agent-view--keyboard-open' : ''}`}
		>
			<div className="agent-toolbar">
				<div className="agent-toolbar__row">
					<button
						type="button"
						className="btn btn--ghost btn--sm"
						onClick={() => void clearChat()}
						disabled={loading || items.length === 0}
					>
						Clear chat
					</button>
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
			</div>

			<AgentStatusBar status={turnStatus} />
			<Conversation items={items} />
			{error && <div className="agent-error">{error}</div>}
			<PermissionPrompt projectId={project.id} incoming={permissionRequests} />
			<PromptComposer
				value={prompt}
				onChange={setPrompt}
				onSend={() => void handleSend()}
				onStop={() => void handleStop()}
				loading={loading}
				mode={mode}
				onModeChange={setMode}
				model={selectedModel}
				availableModels={availableModels}
				onModelChange={setSelectedModel}
				attachments={attachments}
				onAddAttachments={(files) => void handleAddAttachments(files)}
				onRemoveAttachment={handleRemoveAttachment}
				keyboardOpen={keyboardOpen}
			/>
		</div>
	)
}
