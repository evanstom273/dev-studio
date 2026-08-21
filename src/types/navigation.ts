export type NavItem = {
	id: 'agent' | 'changes' | 'files'
	label: string
	shortLabel: string
}

export const NAV_ITEMS: NavItem[] = [
	{ id: 'agent', label: 'Agent', shortLabel: 'Agent' },
	{ id: 'changes', label: 'Changes', shortLabel: 'Diff' },
	{ id: 'files', label: 'Files', shortLabel: 'Files' },
]
