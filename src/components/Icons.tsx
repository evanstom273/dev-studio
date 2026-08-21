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

export function IconChevronDown({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconChevronUp({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
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

export function IconRepo({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<circle cx="6" cy="6" r="2" />
			<circle cx="6" cy="18" r="2" />
			<circle cx="18" cy="12" r="2" />
			<path d="M8 6h8M8 18h5a3 3 0 003-3v-2" strokeLinecap="round" />
		</svg>
	)
}

export function IconBranch({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<circle cx="6" cy="6" r="2" />
			<circle cx="6" cy="18" r="2" />
			<circle cx="18" cy="9" r="2" />
			<path d="M6 8v8M6 14a6 6 0 016-6h4" strokeLinecap="round" />
		</svg>
	)
}

export function IconCommit({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<circle cx="12" cy="12" r="3" />
			<path d="M3 12h6M15 12h6" strokeLinecap="round" />
		</svg>
	)
}

export function IconGitPr({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<circle cx="6" cy="18" r="2" />
			<circle cx="6" cy="6" r="2" />
			<circle cx="18" cy="6" r="2" />
			<path d="M6 8v8M18 8v1a4 4 0 01-4 4H6" strokeLinecap="round" />
		</svg>
	)
}

export function IconPlus({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M12 5v14M5 12h14" strokeLinecap="round" />
		</svg>
	)
}

export function IconStop({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor">
			<rect x="6" y="6" width="12" height="12" rx="2" />
		</svg>
	)
}

export function IconCopy({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<rect x="9" y="9" width="13" height="13" rx="2" strokeLinecap="round" />
			<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" />
		</svg>
	)
}

export function IconCheck({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconClose({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
		</svg>
	)
}

export function IconImage({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" />
			<circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
			<path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconCode({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M16 18l6-6-6-6M8 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconDocument({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" />
		</svg>
	)
}

export function IconSparkles({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2z" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M19 17l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconDots({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor">
			<circle cx="12" cy="12" r="1.5" />
			<circle cx="19" cy="12" r="1.5" />
			<circle cx="5" cy="12" r="1.5" />
		</svg>
	)
}

export function IconSettings({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
			<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconSearch({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<circle cx="11" cy="11" r="7" />
			<path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconFilter({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
		</svg>
	)
}

export function IconRefresh({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M20 11a8.1 8.1 0 00-15.5-2m-.5-4v4h4M4 13a8.1 8.1 0 0015.5 2m.5 4v-4h-4" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconChat({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconTrash({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconTerminal({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M4 17l6-6-6-6M12 19h8" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}
