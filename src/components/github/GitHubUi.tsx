import { useEffect, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

type SheetProps = {
	open: boolean
	title: string
	onClose: () => void
	children: ReactNode
}

export function Sheet({ open, title, onClose, children }: SheetProps) {
	useEffect(() => {
		if (open) document.body.style.overflow = 'hidden'
		return () => { document.body.style.overflow = '' }
	}, [open])

	if (!open) return null

	return (
		<div className="sheet-backdrop" onClick={onClose} role="presentation">
			<div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
				<header className="sheet__header">
					<h2 className="sheet__title">{title}</h2>
					<button type="button" className="sheet__close" onClick={onClose} aria-label="Close">×</button>
				</header>
				<div className="sheet__body">{children}</div>
			</div>
		</div>
	)
}

type FieldProps = {
	label: string
	children: ReactNode
	hint?: string
}

export function Field({ label, children, hint }: FieldProps) {
	return (
		<label className="gh-field">
			<span className="gh-field__label">{label}</span>
			{children}
			{hint && <span className="gh-field__hint">{hint}</span>}
		</label>
	)
}

export function GhInput(props: InputHTMLAttributes<HTMLInputElement>) {
	return <input className="gh-field__input" {...props} />
}

export function GhTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea className="gh-field__textarea" {...props} />
}

export function GhSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
	return <select className="gh-field__input" {...props} />
}

type ToggleProps = {
	checked: boolean
	onChange: (checked: boolean) => void
	label: string
}

export function GhToggle({ checked, onChange, label }: ToggleProps) {
	return (
		<label className="gh-toggle">
			<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
			<span>{label}</span>
		</label>
	)
}

export function SheetActions({ children }: { children: React.ReactNode }) {
	return <div className="sheet__actions">{children}</div>
}

export function formatRelativeDate(iso: string): string {
	const date = new Date(iso)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
	if (diffDays === 0) return 'Today'
	if (diffDays === 1) return 'Yesterday'
	if (diffDays < 7) return `${diffDays}d ago`
	return date.toLocaleDateString()
}

export function prStateClass(state: string): string {
	if (state === 'open') return 'gh-badge--open'
	if (state === 'merged') return 'gh-badge--merged'
	return 'gh-badge--closed'
}
