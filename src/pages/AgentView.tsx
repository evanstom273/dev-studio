import { useCallback, useEffect, useRef, useState } from 'react'
import type {
	ActivityTimelineItem,
	AgentActivityItem,
	AgentMode,
	AgentModelDefinition,
	AttachmentInfo,
	ConversationItem,
	PermissionRequest,
	StreamEvent,
} from '@shared/types/agent'
import type { Project } from '@shared/types/project'
import { Conversation } from '../components/Conversation'
import { PermissionPrompt } from '../components/PermissionPrompt'
import { PromptComposer } from '../components/PromptComposer'
import { agentApi } from '../services/agentApi'
import {
	clearLiveStatusActivity,
	filterConversationItems,
	upsertLiveStatusActivity,
} from '../utils/activityTimeline'
import '../styles/agent.css'

export type AgentActions = {
	runCommand: (command: string, label: string) => Promise<void>
	clearChat: () => Promise<void>
}

type AgentViewProps = {
	project: Project
	onRegisterActions?: (actions: AgentActions) => void
	keyboardOpen?: boolean
	initialPrompt?: string | null
	onClearInitialPrompt?: () => void
}

export function AgentView({
	project,
	onRegisterActions,
	keyboardOpen = false,
	initialPrompt,
	onClearInitialPrompt,
}: AgentViewProps) {
	const [items, setItems] = useState<ConversationItem[]>([])
	const [prompt, setPrompt] = useState('')
	const [mode, setMode] = useState<AgentMode>('agent')
	const [availableModels, setAvailableModels] = useState<string[]>([])
	const [modelDefinitions, setModelDefinitions] = useState<AgentModelDefinition[]>([])
	const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined)
	const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<string | undefined>(undefined)
	const [selectedSpeed, setSelectedSpeed] = useState<string | undefined>(undefined)
	const [attachments, setAttachments] = useState<AttachmentInfo[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([])
	const [liveTimeline, setLiveTimeline] = useState<ActivityTimelineItem | null>(null)
	const liveTimelineRef = useRef<ActivityTimelineItem | null>(null)
	const [streamingContent, setStreamingContent] = useState<string | null>(null)

	useEffect(() => {
		liveTimelineRef.current = liveTimeline
	}, [liveTimeline])

	useEffect(() => {
		if (initialPrompt) {
			setPrompt((prev) => (prev ? `${prev}\n\n${initialPrompt}` : initialPrompt))
			onClearInitialPrompt?.()
		}
	}, [initialPrompt, onClearInitialPrompt])

	const loadSession = useCallback(async () => {
		try {
			const session = await agentApi.getSession(project.id)
			setItems(filterConversationItems(session.items))
			setMode(session.mode)
			if (session.model) {
				setSelectedModel(session.model)
			}
			if (session.reasoningEffort) {
				setSelectedReasoningEffort(session.reasoningEffort)
			}
			if (session.speed) {
				setSelectedSpeed(session.speed)
			}
		} catch {
			setItems([])
		}
	}, [project.id])

	useEffect(() => {
		void loadSession()
		agentApi
			.getAvailableModelsInfo()
			.then((res) => {
				setAvailableModels(res.models ?? [])
				if (res.modelDefinitions) {
					setModelDefinitions(res.modelDefinitions)
				}
			})
			.catch(() => {
				agentApi
					.getAvailableModels()
					.then((models) => setAvailableModels(models))
					.catch(() => {})
			})
	}, [loadSession])

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
			setLiveTimeline((prev) =>
				prev
					? {
							...prev,
							status: 'complete',
							completedAt: Date.now(),
							durationMs: Date.now() - prev.startedAt,
						}
					: null,
			)
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

		const initialTimeline: ActivityTimelineItem = {
			id: `live-timeline-${Date.now()}`,
			kind: 'activity_timeline',
			status: 'running',
			startedAt: Date.now(),
			activities: [],
			entries: [],
			timestamp: now,
		}
		setLiveTimeline(initialTimeline)
		setStreamingContent(null)

		let agentBuffer = ''

		try {
			await agentApi.sendMessage(
				{
					projectId: project.id,
					content: promptWithContext,
					mode,
					model: selectedModel,
					reasoningEffort: selectedReasoningEffort,
					speed: selectedSpeed,
					attachments: currentAttachments,
				},
				(raw) => {
					const event = raw as StreamEvent
					if (event.type === 'commentary_delta') {
						setLiveTimeline((prev) => {
							if (!prev || !event.content.trim()) return prev
							const entries = prev.entries ? [...prev.entries] : []
							const last = entries[entries.length - 1]
							if (last?.kind === 'commentary') {
								entries[entries.length - 1] = { ...last, content: `${last.content}${last.content ? '\n' : ''}${event.content.trim()}` }
							} else {
								entries.push({ id: `commentary-${Date.now()}-${entries.length}`, kind: 'commentary', content: event.content.trim(), createdAt: Date.now() })
							}
							return { ...prev, entries }
						})
					}
					if (event.type === 'message_delta') {
						agentBuffer += event.content
						setStreamingContent(agentBuffer)
					}
					if (event.type === 'activity_start') {
						setLiveTimeline((prev) => {
							if (!prev) return prev
							const baseActivities = clearLiveStatusActivity(prev.activities)
							const exists = baseActivities.some((a) => a.id === event.activity.id)
							if (exists) {
								return {
									...prev,
									activities: baseActivities.map((a) =>
										a.id === event.activity.id ? event.activity : a,
									),
								}
							}
							return {
								...prev,
								activities: [...baseActivities, event.activity],
								entries: [
									...(prev.entries ?? []),
									{ id: `entry-${event.activity.id}`, kind: 'activity', activityId: event.activity.id, createdAt: event.activity.startedAt },
								],
							}
						})
					}
					if (event.type === 'activity_complete') {
						setLiveTimeline((prev) => {
							if (!prev) return prev
							const baseActivities = clearLiveStatusActivity(prev.activities)
							const exists = baseActivities.some((a) => a.id === event.activity.id)
							if (exists) {
								return {
									...prev,
									activities: baseActivities.map((a) =>
										a.id === event.activity.id ? event.activity : a,
									),
								}
							}
							return {
								...prev,
								activities: [...baseActivities, event.activity],
								entries: [
									...(prev.entries ?? []),
									{ id: `entry-${event.activity.id}`, kind: 'activity', activityId: event.activity.id, createdAt: event.activity.startedAt },
								],
							}
						})
					}
					if (event.type === 'turn_status') {
						setLiveTimeline((prev) => {
							if (!prev) return prev
							const activities =
								event.status === 'running'
									? upsertLiveStatusActivity(prev.activities, event.label, event.tool)
									: clearLiveStatusActivity(prev.activities)
							return {
								...prev,
								activities,
								durationMs: event.durationMs ?? prev.durationMs,
								usage: event.usage ?? prev.usage,
								tokensPerSecond: event.tokensPerSecond ?? prev.tokensPerSecond,
							}
						})
					}
					if (event.type === 'permission_request') {
						setPermissionRequests((prev) => {
							if (prev.some((p) => p.id === event.permission.id)) return prev
							return [...prev, event.permission]
						})
					}
					if (event.type === 'error') {
						setError(event.message)
						setLiveTimeline((prev) => {
							if (!prev) return null
							const errorActivity: AgentActivityItem = {
								id: `act-error-${Date.now()}`,
								type: 'error',
								status: 'failed',
								title: 'Agent error',
								detail: { error: event.message },
								startedAt: Date.now(),
								completedAt: Date.now(),
								durationMs: 0,
							}
							const hasError = prev.activities.some((a) => a.type === 'error')
							return {
								...prev,
								status: 'error',
								completedAt: Date.now(),
								durationMs: Date.now() - prev.startedAt,
								activities: hasError ? prev.activities : [...prev.activities, errorActivity],
								entries: hasError ? prev.entries : [
									...(prev.entries ?? []),
									{ id: `entry-${errorActivity.id}`, kind: 'activity', activityId: errorActivity.id, createdAt: errorActivity.startedAt },
								],
							}
						})
					}
					if (event.type === 'done') {
						setLiveTimeline((prev) =>
							prev
								? {
										...prev,
										status: event.status === 'ERROR' ? 'error' : 'complete',
										completedAt: Date.now(),
										durationMs: event.durationMs ?? (Date.now() - prev.startedAt),
										usage: event.usage ?? prev.usage,
									}
								: null,
						)
					}
				},
			)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to send message')
			setLiveTimeline((prev) =>
				prev ? { ...prev, status: 'error', completedAt: Date.now() } : null,
			)
		} finally {
			setLoading(false)

			const timelineSnapshot = liveTimelineRef.current
			setLiveTimeline(null)

			await loadSession()

			if (timelineSnapshot && (timelineSnapshot.activities.length > 0 || Boolean(timelineSnapshot.entries?.length))) {
				setItems((current) => {
					const filtered = filterConversationItems(current)
					const hasPersistedTimeline = filtered.some(
						(item) => item.kind === 'activity_timeline' && (item.activities.length > 0 || Boolean(item.entries?.length)),
					)
					if (hasPersistedTimeline) {
						return filtered
					}
					return [...filtered, timelineSnapshot]
				})
			}

			setStreamingContent(null)
		}
	}

	const runCommand = useCallback(
		async (command: string, label: string) => {
			const actId = `act-${Date.now()}`
			const startAct: AgentActivityItem = {
				id: actId,
				type: 'command',
				status: 'running',
				title: label.startsWith('$') ? label : `$ ${label}`,
				detail: { command },
				startedAt: Date.now(),
			}
			const cmdTimeline: ActivityTimelineItem = {
				id: `timeline-${Date.now()}`,
				kind: 'activity_timeline',
				status: 'running',
				startedAt: Date.now(),
				activities: [startAct],
				entries: [{ id: `entry-${actId}`, kind: 'activity', activityId: actId, createdAt: startAct.startedAt }],
				timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			}
			setItems((prev) => [...prev, cmdTimeline])
			try {
				const result = await agentApi.runCommand({ projectId: project.id, command, label })
				const isSuccess = result.exitCode === 0
				setItems((prev) =>
					prev.map((item) => {
						if (item.id === cmdTimeline.id && item.kind === 'activity_timeline') {
							return {
								...item,
								status: isSuccess ? 'complete' : 'error',
								completedAt: Date.now(),
								durationMs: result.durationMs,
								activities: [
									{
										...startAct,
										status: isSuccess ? 'completed' : 'failed',
										completedAt: Date.now(),
										durationMs: result.durationMs,
										detail: {
											command,
											output: result.stdout || undefined,
											error: result.stderr || undefined,
											exitCode: result.exitCode,
										},
									},
								],
							}
						}
						return item
					}),
				)
			} catch (err) {
				setItems((prev) =>
					prev.map((item) => {
						if (item.id === cmdTimeline.id && item.kind === 'activity_timeline') {
							return {
								...item,
								status: 'error',
								completedAt: Date.now(),
								activities: [
									{
										...startAct,
										status: 'failed',
										completedAt: Date.now(),
										detail: {
											command,
											error: err instanceof Error ? err.message : 'Command failed',
										},
									},
								],
							}
						}
						return item
					}),
				)
			}
		},
		[project.id],
	)

	const clearChat = useCallback(async () => {
		if (loading) return
		if (!confirm('Clear this chat? The conversation history will be reset.')) return

		setLoading(true)
		setError(null)
		setPermissionRequests([])
		setLiveTimeline(null)
		setStreamingContent(null)
		try {
			const session = await agentApi.resetSession(project.id)
			setItems(filterConversationItems(session.items))
			setMode(session.mode)
			setPrompt('')
			setAttachments([])
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to clear chat')
		} finally {
			setLoading(false)
		}
	}, [loading, project.id])

	useEffect(() => {
		onRegisterActions?.({
			runCommand,
			clearChat,
		})
	}, [onRegisterActions, runCommand, clearChat])

	return (
		<div
			className={`workspace-pane agent-view${keyboardOpen ? ' agent-view--keyboard-open' : ''}`}
		>
			<Conversation
				items={items}
				liveTimeline={liveTimeline}
				streamingContent={streamingContent}
			/>
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
				modelDefinitions={modelDefinitions}
				onModelChange={setSelectedModel}
				reasoningEffort={selectedReasoningEffort}
				onReasoningEffortChange={setSelectedReasoningEffort}
				speed={selectedSpeed}
				onSpeedChange={setSelectedSpeed}
				attachments={attachments}
				onAddAttachments={(files) => void handleAddAttachments(files)}
				onRemoveAttachment={handleRemoveAttachment}
				keyboardOpen={keyboardOpen}
			/>
		</div>
	)
}
