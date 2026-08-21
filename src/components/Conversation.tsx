import { useMemo, useState } from 'react'
import type { ConversationItem } from '@shared/types/agent'
import { IconCheck, IconCopy } from './Icons'
import '../styles/agent.css'

type ConversationProps = {
	items: ConversationItem[]
}

function CodeBlock({ language, code }: { language: string; code: string }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// clipboard permission error
		}
	}

	return (
		<div className="code-block">
			<div className="code-block__header">
				<span className="code-block__lang">{language || 'code'}</span>
				<button
					type="button"
					className="code-block__copy-btn"
					onClick={handleCopy}
					aria-label="Copy code block"
					title="Copy code"
				>
					{copied ? (
						<>
							<IconCheck className="code-block__copy-icon" />
							<span className="code-block__copy-text">Copied!</span>
						</>
					) : (
						<>
							<IconCopy className="code-block__copy-icon" />
							<span className="code-block__copy-text">Copy code</span>
						</>
					)}
				</button>
			</div>
			<pre className="code-block__pre">
				<code className="code-block__code">{code}</code>
			</pre>
		</div>
	)
}

function FormattedContent({ content }: { content: string }) {
	const segments = useMemo(() => {
		const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = []
		const fenceRe = /```([a-zA-Z0-9_.-]*)\n([\s\S]*?)```/g
		let lastIndex = 0
		let match: RegExpExecArray | null

		while ((match = fenceRe.exec(content)) !== null) {
			if (match.index > lastIndex) {
				const text = content.slice(lastIndex, match.index)
				if (text.length > 0) {
					parts.push({ type: 'text', content: text })
				}
			}
			parts.push({
				type: 'code',
				language: match[1] || 'code',
				content: match[2],
			})
			lastIndex = fenceRe.lastIndex
		}

		if (lastIndex < content.length) {
			const text = content.slice(lastIndex)
			if (text.length > 0) {
				parts.push({ type: 'text', content: text })
			}
		}

		return parts.length > 0 ? parts : [{ type: 'text' as const, content }]
	}, [content])

	return (
		<div className="message__body">
			{segments.map((seg, i) =>
				seg.type === 'code' ? (
					<CodeBlock key={i} language={seg.language ?? ''} code={seg.content} />
				) : (
					<p key={i} className="message__content">
						{seg.content}
					</p>
				),
			)}
		</div>
	)
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
			<FormattedContent content={item.content} />
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
