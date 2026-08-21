import type { ConnectionConfig } from '@shared/types/connection'
import type { BackendHealth } from '@shared/types/agent'

const STORAGE_KEY = 'dev-studio-connection'

const DEFAULT_CONFIG: ConnectionConfig = {
	backendUrl: '',
	token: '',
}

export function loadConnectionConfig(): ConnectionConfig {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return { ...DEFAULT_CONFIG }
		return { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as ConnectionConfig
	} catch {
		return { ...DEFAULT_CONFIG }
	}
}

export function saveConnectionConfig(config: ConnectionConfig): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function getApiBase(): string {
	const config = loadConnectionConfig()
	if (config.backendUrl) {
		return config.backendUrl.replace(/\/$/, '')
	}
	return ''
}

export function getAuthHeaders(): HeadersInit {
	const config = loadConnectionConfig()
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	}
	if (config.token) {
		headers.Authorization = `Bearer ${config.token}`
	}
	return headers
}

export class ApiClientError extends Error {
	constructor(
		message: string,
		public status: number,
		public code?: string,
	) {
		super(message)
		this.name = 'ApiClientError'
	}
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const base = getApiBase()
	if (!base) {
		throw new ApiClientError('Backend URL not configured', 0, 'NOT_CONFIGURED')
	}

	const response = await fetch(`${base}${path}`, {
		...init,
		headers: {
			...getAuthHeaders(),
			...init?.headers,
		},
	})

	if (!response.ok) {
		let errorBody: { error?: string; code?: string } = {}
		try {
			errorBody = await response.json()
		} catch {
			// ignore
		}
		throw new ApiClientError(
			errorBody.error ?? `Request failed (${response.status})`,
			response.status,
			errorBody.code,
		)
	}

	return response.json() as Promise<T>
}

export async function checkHealth(): Promise<BackendHealth> {
	return apiFetch<BackendHealth>('/api/health')
}

export async function streamAgentMessage(
	projectId: string,
	content: string,
	mode: 'agent' | 'ask' | 'plan',
	onEvent: (event: unknown) => void,
): Promise<void> {
	const base = getApiBase()
	if (!base) throw new ApiClientError('Backend URL not configured', 0, 'NOT_CONFIGURED')

	const response = await fetch(`${base}/api/agent/message`, {
		method: 'POST',
		headers: getAuthHeaders(),
		body: JSON.stringify({ projectId, content, mode }),
	})

	if (!response.ok) {
		throw new ApiClientError(`Stream failed (${response.status})`, response.status)
	}

	const reader = response.body?.getReader()
	if (!reader) throw new ApiClientError('No response body', 0)

	const decoder = new TextDecoder()
	let buffer = ''

	while (true) {
		const { done, value } = await reader.read()
		if (done) break

		buffer += decoder.decode(value, { stream: true })
		const parts = buffer.split('\n\n')
		buffer = parts.pop() ?? ''

		for (const part of parts) {
			const dataLine = part.split('\n').find((l) => l.startsWith('data: '))
			if (!dataLine) continue
			try {
				onEvent(JSON.parse(dataLine.slice(6)))
			} catch {
				// skip malformed
			}
		}
	}
}
