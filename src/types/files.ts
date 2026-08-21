export type ChangeStatus = 'modified' | 'added' | 'deleted'

export type ChangedFile = {
	path: string
	status: ChangeStatus
}

export type FileDiff = {
	path: string
	hunks: DiffHunk[]
}

export type DiffHunk = {
	header: string
	lines: DiffLine[]
}

export type DiffLine = {
	type: 'context' | 'add' | 'remove'
	content: string
	oldLineNumber?: number
	newLineNumber?: number
}

export type FileTreeNode = {
	name: string
	path: string
	kind: 'file' | 'folder'
	children?: FileTreeNode[]
	content?: string
}
