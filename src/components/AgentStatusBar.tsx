import { useEffect, useState } from 'react'
import type { LiveTurnStatus } from '../utils/turnStatus'
import { formatDuration, formatTurnMeta } from '../utils/turnStatus'
import '../styles/agent.css'

type AgentStatusBarProps = {
	status: LiveTurnStatus | null
}

export function AgentStatusBar({ status }: AgentStatusBarProps) {
	const [now, setNow] = useState(Date.now())

	useEffect(() => {
		if (!status || status.status !== 'running') return
		const interval = setInterval(() => setNow(Date.now()), 250)
		return () => clearInterval(interval)
	}, [status])

	if (!status) return null

	const meta = formatTurnMeta(status, now)
	const isRunning = status.status === 'running'

	return (
		<div className={`agent-status${isRunning ? ' agent-status--running' : ' agent-status--complete'}`}>
			<div className="agent-status__main">
				<span className={`agent-status__dot${isRunning ? ' agent-status__dot--running' : ''}`} aria-hidden="true" />
				<span className="agent-status__label">{status.label}</span>
				<span className="agent-status__meta">{meta}</span>
			</div>
			{status.tools.length > 0 && (
				<div className="agent-status__tools">
					{status.tools.map((tool) => (
						<span key={tool.name} className="agent-status__chip">
							{tool.name}
							{tool.count > 1 ? ` ×${tool.count}` : ''}
							{tool.totalDurationMs > 0 ? ` · ${formatDuration(tool.totalDurationMs)}` : ''}
						</span>
					))}
				</div>
			)}
		</div>
	)
}
