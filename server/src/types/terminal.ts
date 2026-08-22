export type TerminalSessionInfo = {
	id: string
	projectId: string
	title: string
	cwd: string
	createdAt: string
	lastActive: string
}

export type CreateTerminalSessionRequest = {
	title?: string
	cwd?: string
}

export type TerminalClientMessage =
	| { type: 'input'; data: string }
	| { type: 'resize'; cols: number; rows: number }
	| { type: 'rename'; title: string }

export type TerminalServerMessage =
	| { type: 'output'; data: string }
	| { type: 'history'; data: string }
	| { type: 'exit'; code: number }
	| { type: 'error'; message: string }
