import { useEffect, useRef, useState } from 'react'
import type { ActivityTimelineItem, ConversationItem } from '@shared/types/agent'
import { ActivityItem } from './ActivityItem'
import { ActivityTimeline } from './ActivityTimeline'
import { IconCheck, IconCopy } from './Icons'
import { MarkdownRenderer } from './MarkdownRenderer'
import '../styles/agent.css'

type ConversationProps = {
	items: ConversationItem[]
	liveTimeline?: ActivityTimelineItem | null
	streamingContent?: string | null
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

export function Conversation({ items, liveTimeline, streamingContent }: ConversationProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const isNearBottomRef = useRef<boolean>(true)

	const handleScroll = () => {
		if (!containerRef.current) return
		const { scrollTop, scrollHeight, clientHeight } = containerRef.current
		const distanceToBottom = scrollHeight - scrollTop - clientHeight
		isNearBottomRef.current = distanceToBottom < 60
	}

	useEffect(() => {
		if (isNearBottomRef.current && containerRef.current) {
			containerRef.current.scrollTo({
				top: containerRef.current.scrollHeight,
				behavior: 'smooth',
			})
		}
	}, [items, liveTimeline, streamingContent])

	return (
		<div
			ref={containerRef}
			onScroll={handleScroll}
			className="conversation"
			role="log"
			aria-label="Agent conversation"
		>
			{items.map((item) => {
				if (item.kind === 'activity_timeline') {
					const hasActivities = item.activities.length > 0
					return (
						<ActivityTimeline
							key={item.id}
							timeline={item}
							defaultExpanded={hasActivities && item.status === 'error'}
						/>
					)
				}

				if (item.kind === 'activity') {
					return <ActivityItem key={item.id} item={item} />
				}

				return <MessageCard key={item.id} item={item} />
			})}

			{/* Active Live Turn Activity Timeline */}
			{liveTimeline && (
				<ActivityTimeline key={liveTimeline.id} timeline={liveTimeline} isLive defaultExpanded={true} />
			)}

			{/* Streaming Agent Response */}
			{streamingContent && (
				<MessageCard
					item={{
						id: 'streaming-agent-response',
						kind: 'message',
						role: 'agent',
						content: streamingContent,
						timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
					}}
				/>
			)}

			<div style={{ height: 1 }} />
		</div>
	)
}
