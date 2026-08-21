import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { IconSend } from './Icons'
import '../styles/agent.css'

type PromptComposerProps = {
	value: string
	onChange: (value: string) => void
	onSend: () => void
	keyboardOpen?: boolean
}

export function PromptComposer({
	value,
	onChange,
	onSend,
	keyboardOpen = false,
}: PromptComposerProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	useEffect(() => {
		const textarea = textareaRef.current
		if (!textarea) return
		textarea.style.height = 'auto'
		textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
	}, [value])

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault()
		if (value.trim()) onSend()
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			if (value.trim()) onSend()
		}
	}

	return (
		<form
			className={`composer${keyboardOpen ? ' composer--keyboard-open' : ''}`}
			onSubmit={handleSubmit}
		>
			<div className="composer__row">
				<textarea
					ref={textareaRef}
					className="composer__input"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Describe a coding task..."
					rows={1}
					aria-label="Prompt input"
				/>
				<button
					type="submit"
					className="composer__send"
					disabled={!value.trim()}
					aria-label="Send message"
				>
					<IconSend className="bottom-nav__icon" />
				</button>
			</div>
		</form>
	)
}
