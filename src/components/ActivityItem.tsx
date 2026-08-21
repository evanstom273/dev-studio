import { useState } from 'react'
import type { ConversationItem } from '@shared/types/agent'
import { IconChevron, IconCode, IconFile, IconTerminal } from './Icons'

type ActivityItemProps = {
	item: Extract<ConversationItem, { kind: 'activity' }>
}

function getActivityIcon(label: string, toolName?: string) {
	if (toolName === 'run_command' || label.startsWith('$') || label.includes('npm ') || label.includes('git ')) {
		return IconTerminal
	}
	if (label.toLowerCase().includes('edit') || label.toLowerCase().includes('write')) {
		return IconCode
	}
	if (label.toLowerCase().includes('read') || label.toLowerCase().includes('file')) {
		return IconFile
	}
	return null
}

export function ActivityItem({ item }: ActivityItemProps) {
	const [expanded, setExpanded] = useState(false)
	const isCommand = item.label.startsWith('$ ') || item.toolName === 'run_command'
	const Icon = getActivityIcon(item.label, item.toolName)

	return (
		<div
			className={`activity-row activity-row--${item.status}${isCommand ? ' activity-row--command' : ''}`}
			role="status"
		>
			<div className="activity-row__header" onClick={() => setExpanded((prev) => !prev)}>
				<span
					className={`activity-row__dot activity-row__dot--${item.status}`}
					aria-hidden="true"
				/>

				{Icon && <Icon className="activity-row__icon" />}

				<span className="activity-row__label">{item.label}</span>

				{item.timestamp && (
					<span className="activity-row__time">{item.timestamp}</span>
				)}

				<IconChevron
					className={`activity-row__chevron${expanded ? ' is-open' : ''}`}
				/>
			</div>

			{expanded && (
				<div className="activity-row__details">
					<div className="activity-row__meta-item">
						<span className="activity-row__meta-key">Status:</span>
						<span className="activity-row__meta-val">{item.status}</span>
					</div>
					{item.toolName && (
						<div className="activity-row__meta-item">
							<span className="activity-row__meta-key">Tool:</span>
							<span className="activity-row__meta-val">{item.toolName}</span>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
