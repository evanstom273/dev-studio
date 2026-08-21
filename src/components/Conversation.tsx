import { useState } from 'react'
import type { ConversationItem } from '@shared/types/agent'
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
				<time className="message__time">{item.timestamp}</time>
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
	return (
		<div className="conversation" role="log" aria-label="Agent conversation">
			{items.map((item) => {
				if (item.kind === 'activity') {
					return (
						<div key={item.id} className="activity">
							<span
								className={`activity__indicator activity__indicator--${item.status}`}
								aria-hidden="true"
							/>
							<span className="activity__label">{item.label}</span>
						</div>
					)
				}

				return <MessageCard key={item.id} item={item} />
			})}
		</div>
	)
}
