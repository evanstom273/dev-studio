import { useState } from 'react'
import type { ConversationItem } from '../types/agent'
import { Conversation } from '../components/Conversation'
import { PromptComposer } from '../components/PromptComposer'
import { useVisualViewport } from '../hooks/useVisualViewport'
import { MOCK_CONVERSATION } from '../services/mockData'

export function AgentView() {
	const [items, setItems] = useState<ConversationItem[]>(MOCK_CONVERSATION)
	const [prompt, setPrompt] = useState('')
	const viewport = useVisualViewport()

	const handleSend = () => {
		const trimmed = prompt.trim()
		if (!trimmed) return

		const now = new Date()
		const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

		setItems((prev) => [
			...prev,
			{
				id: `msg-${Date.now()}`,
				kind: 'message',
				role: 'user',
				content: trimmed,
				timestamp,
			},
		])
		setPrompt('')
	}

	const shellStyle = viewport.keyboardOpen
		? {
				height: `${viewport.height}px`,
				transform: `translateY(${viewport.offsetTop}px)`,
			}
		: undefined

	return (
		<div className="workspace-pane" style={shellStyle}>
			<Conversation items={items} />
			<PromptComposer
				value={prompt}
				onChange={setPrompt}
				onSend={handleSend}
				keyboardOpen={viewport.keyboardOpen}
			/>
		</div>
	)
}
