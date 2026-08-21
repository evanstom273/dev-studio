export type ConnectionConfig = {
	backendUrl: string
	token: string
}

export type ConnectionState =
	| { status: 'disconnected' }
	| { status: 'connecting' }
	| { status: 'connected'; health: import('./agent.js').BackendHealth }
	| { status: 'error'; message: string }

export type ApiError = {
	error: string
	code?: string
	details?: string
}
