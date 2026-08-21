import type { AgentMode } from '@shared/types/agent'
import { AGENT_MODES } from '../types/index'
import '../styles/agent.css'

type ModeSelectorProps = {
	mode: AgentMode
	onChange: (mode: AgentMode) => void
	disabled?: boolean
}

export function ModeSelector({ mode, onChange, disabled }: ModeSelectorProps) {
	return (
		<div className="mode-selector" role="radiogroup" aria-label="Agent mode">
			{AGENT_MODES.map((m) => (
				<button
					key={m.id}
					type="button"
					role="radio"
					aria-checked={mode === m.id}
					className={`mode-selector__btn${mode === m.id ? ' is-active' : ''}`}
					onClick={() => onChange(m.id)}
					disabled={disabled}
					title={m.description}
				>
					{m.label}
				</button>
			))}
		</div>
	)
}
