import { useEffect, useRef, useState } from 'react'
import type { ConversationItem } from '@shared/types/agent'
import { ActivityItem } from './ActivityItem'
import { IconCheck, IconCopy } from './Icons'
import { MarkdownRenderer } from './MarkdownRenderer'
import '../styles/agent.css'

type ConversationProps = {
	items: ConversationItem[]
}

function MessageCard({ item }: { item: Extract<ConversationItem, { kind: 'message' }> }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(item.content)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// clipboard permission error
		}
	}

	return (
		<article className={`message message--${item.role}`}>
			<div className="message__header">
				<div className="message__meta">
					<span className="message__role-tag">
						{item.role === 'user' ? 'You' : 'Dev Studio'}
					</span>
					<time className="message__time">{item.timestamp}</time>
				</div>
				<button
					type="button"
					className="message__copy-btn"
					onClick={handleCopy}
					aria-label="Copy entire message"
					title="Copy entire message"
				>
					{copied ? (
						<IconCheck className="message__copy-icon" />
					) : (
						<IconCopy className="message__copy-icon" />
					)}
				</button>
			</div>
			<div className="message__body">
				<MarkdownRenderer content={item.content} />
			</div>
		</article>
	)
}

export function Conversation({ items }: ConversationProps) {
	const endRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [items])

	return (
		<div className="conversation" role="log" aria-label="Agent conversation">
			{items.map((item) => {
				if (item.kind === 'activity') {
					return <ActivityItem key={item.id} item={item} />
				}

				return <MessageCard key={item.id} item={item} />
			})}
			<div ref={endRef} style={{ height: 1 }} />
		</div>
	)
}
