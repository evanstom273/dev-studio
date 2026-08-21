export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'

export type ChangedFile = {
	path: string
	status: ChangeStatus
	oldPath?: string
	staged: boolean
	additions?: number
	deletions?: number
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
}

export type GitStatus = {
	branch: string
	ahead: number
	behind: number
	changed: ChangedFile[]
	clean: boolean
	hasConflicts: boolean
}

export type GitCommit = {
	hash: string
	shortHash: string
	message: string
	author: string
	date: string
}

export type GitBranch = {
	name: string
	current: boolean
	remote?: string
	ahead?: number
	behind?: number
}

export type StageRequest = {
	paths: string[]
}

export type CommitRequest = {
	message: string
}

export type BranchRequest = {
	name: string
	create?: boolean
}

export type MergeRequest = {
	branch: string
}

export type DiscardRequest = {
	paths: string[]
}

export type RemoteRequest = {
	name: string
	url: string
}

export type PullRequest = {
	remote?: string
	branch?: string
	rebase?: boolean
}

export type PushRequest = {
	remote?: string
	branch?: string
	force?: boolean
}

export type RevertRequest = {
	commitHash: string
}

export type MergeConflict = {
	path: string
	status: 'both_modified' | 'deleted_by_us' | 'deleted_by_them' | 'added_by_both'
}
