type IconProps = {
	className?: string
	style?: React.CSSProperties
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

export function IconStatus({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconClock({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<circle cx="12" cy="12" r="9" />
			<path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconGauge({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M12 3a9 9 0 00-9 9c0 3.12 1.59 5.87 4 7.46M12 3a9 9 0 019 9c0 3.12-1.59 5.87-4 7.46M12 12l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="12" cy="12" r="2" fill="currentColor" />
		</svg>
	)
}

export function IconExternalLink({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconWorkflow({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<circle cx="18" cy="18" r="3" />
			<circle cx="6" cy="6" r="3" />
			<path d="M6 9v12M18 9a9 9 0 00-9 9" strokeLinecap="round" />
		</svg>
	)
}

export function IconTools({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconArtifact({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconSave({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M17 21v-8H7v8M7 3v5h8" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconUndo({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M3 7v6h6M3 13a9 9 0 0115.36-5.36L21 10" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconRedo({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M21 7v6h-6M21 13a9 9 0 00-15.36-5.36L3 10" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconEye({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	)
}

export function IconEdit({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconExport({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconDiagram({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="14" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
			<path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4" strokeLinecap="round" />
		</svg>
	)
}

export function IconMic({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 22h8" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconMicOff({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<line x1="2" y1="2" x2="22" y2="22" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.68-1.33" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M19 10v2a7 7 0 01-12 5.19M5 10v2a7 7 0 001.27 4.02M12 19v3M8 22h8" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconProcess({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<rect x="4" y="4" width="16" height="16" rx="2" strokeLinecap="round" />
			<rect x="9" y="9" width="6" height="6" />
			<path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" strokeLinecap="round" />
		</svg>
	)
}

export function IconServer({ className }: IconProps) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<rect x="2" y="2" width="20" height="8" rx="2" strokeLinecap="round" />
			<rect x="2" y="14" width="20" height="8" rx="2" strokeLinecap="round" />
			<line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="2.5" strokeLinecap="round" />
			<line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="2.5" strokeLinecap="round" />
		</svg>
	)
}

export function IconProblem({ className, style }: IconProps) {
	return (
		<svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinejoin="round" />
			<line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
			<line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" strokeLinecap="round" />
		</svg>
	)
}

export function IconPlan({ className, style }: IconProps) {
	return (
		<svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconShield({ className, style }: IconProps) {
	return (
		<svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinejoin="round" />
		</svg>
	)
}

export function IconPlay({ className, style }: IconProps) {
	return (
		<svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<polygon points="5 3 19 12 5 21 5 3" strokeLinejoin="round" />
		</svg>
	)
}

export function IconKill({ className, style }: IconProps) {
	return (
		<svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<circle cx="12" cy="12" r="10" />
			<line x1="15" y1="9" x2="9" y2="15" strokeLinecap="round" />
			<line x1="9" y1="9" x2="15" y2="15" strokeLinecap="round" />
		</svg>
	)
}

export function IconCheckCircle({ className, style }: IconProps) {
	return (
		<svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
			<polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	)
}

export function IconAlertTriangle({ className, style }: IconProps) {
	return (
		<svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinejoin="round" />
			<line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
			<line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" strokeLinecap="round" />
		</svg>
	)
}

export function IconAlertCircle({ className, style }: IconProps) {
	return (
		<svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<circle cx="12" cy="12" r="10" />
			<line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
			<line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" strokeLinecap="round" />
		</svg>
	)
}

export function IconInfo({ className, style }: IconProps) {
	return (
		<svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
			<circle cx="12" cy="12" r="10" />
			<line x1="12" y1="16" x2="12" y2="12" strokeLinecap="round" />
			<line x1="12" y1="8" x2="12.01" y2="8" strokeWidth="2" strokeLinecap="round" />
		</svg>
	)
}



