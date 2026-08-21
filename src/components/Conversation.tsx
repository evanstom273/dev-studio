import type { ConversationItem } from '@shared/types/agent'
import '../styles/agent.css'

type ConversationProps = {
	items: ConversationItem[]
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

				return (
					<article
						key={item.id}
						className={`message message--${item.role}`}
					>
						<p className="message__content">{item.content}</p>
						<time className="message__time">{item.timestamp}</time>
					</article>
				)
			})}
		</div>
	)
}
