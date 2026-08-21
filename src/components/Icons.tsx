type IconProps = {
	className?: string
}

export function IconAgent({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M12 3v2M8 5h8M6 8h12v10a2 2 0 01-2 2H8a2 2 0 01-2-2V8z" strokeLinecap="round" />
			<circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
			<circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
		</svg>
	)
}

export function IconChanges({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M7 7h10M7 12h6M7 17h8" strokeLinecap="round" />
			<path d="M17 10l2 2-2 2M5 14l-2-2 2-2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconFiles({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M4 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
		</svg>
	)
}

export function IconBack({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconChevron({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconFolder({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M4 8h6l2 2h8v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
		</svg>
	)
}

export function IconFile({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M8 4h6l4 4v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" />
			<path d="M14 4v4h4" />
		</svg>
	)
}

export function IconSend({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M5 12l14-7-7 14-2-5-5-2z" strokeLinejoin="round" />
		</svg>
	)
}
