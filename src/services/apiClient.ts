import type { ConnectionConfig } from '@shared/types/connection'
import type { BackendHealth } from '@shared/types/agent'

const STORAGE_KEY = 'dev-studio-connection'

const DEFAULT_CONFIG: ConnectionConfig = {
	backendUrl: '',
	token: '',
	githubToken: '',
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

export function getAuthHeaders(options?: { json?: boolean }): HeadersInit {
	const config = loadConnectionConfig()
	const headers: Record<string, string> = {}
	if (options?.json !== false) {
		headers['Content-Type'] = 'application/json'
	}
	if (config.token) {
		headers.Authorization = `Bearer ${config.token}`
	}
	if (config.githubToken) {
		headers['X-GitHub-Token'] = config.githubToken
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

const REQUEST_TIMEOUT_MS = 120000

export async function apiFetch<T>(
	path: string,
	init?: RequestInit,
	options?: { timeoutMs?: number },
): Promise<T> {
	const base = getApiBase()
	if (!base) {
		throw new ApiClientError('Backend URL not configured', 0, 'NOT_CONFIGURED')
	}

	const method = init?.method ?? 'GET'
	const hasBody = init?.body !== undefined && init?.body !== null
	const controller = new AbortController()
	const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS
	const timeout = setTimeout(() => controller.abort(), timeoutMs)

	let response: Response
	try {
		response = await fetch(`${base}${path}`, {
			...init,
			signal: init?.signal ?? controller.signal,
			headers: {
				...getAuthHeaders({ json: hasBody || method !== 'GET' }),
				...init?.headers,
			},
		})
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new ApiClientError('Request timed out — operation took too long', 0, 'TIMEOUT')
		}
		throw new ApiClientError(
			error instanceof Error ? error.message : 'Network request failed',
			0,
			'NETWORK_ERROR',
		)
	} finally {
		clearTimeout(timeout)
	}

	if (!response.ok) {
		let errorBody: { error?: string; message?: string; code?: string } = {}
		let rawText = ''
		try {
			const text = await response.text()
			rawText = text
			errorBody = JSON.parse(text)
		} catch {
			// not json
		}
		const message =
			errorBody.error ||
			errorBody.message ||
			rawText.trim() ||
			`Request failed with status ${response.status}`
		throw new ApiClientError(message, response.status, errorBody.code)
	}

	return response.json() as Promise<T>
}

export async function checkHealth(customBase?: string): Promise<BackendHealth> {
	if (customBase) {
		const base = customBase.replace(/\/$/, '')
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 3000)
		try {
			const res = await fetch(`${base}/api/health`, {
				signal: controller.signal,
				headers: getAuthHeaders({ json: false }),
			})
			if (!res.ok) throw new ApiClientError(`Health check failed (${res.status})`, res.status)
			return (await res.json()) as BackendHealth
		} catch (err) {
			if (err instanceof ApiClientError) throw err
			throw new ApiClientError(err instanceof Error ? err.message : 'Probe failed', 0)
		} finally {
			clearTimeout(timeout)
		}
	}
	return apiFetch<BackendHealth>('/api/health')
}

export async function streamAgentMessage(
	projectId: string,
	content: string,
	mode: 'agent' | 'ask' | 'plan',
	onEvent: (event: unknown) => void,
	options?: {
		model?: string
		attachments?: import('@shared/types/agent').AttachmentInfo[]
		signal?: AbortSignal
	},
): Promise<void> {
	const base = getApiBase()
	if (!base) throw new ApiClientError('Backend URL not configured', 0, 'NOT_CONFIGURED')

	const response = await fetch(`${base}/api/agent/message`, {
		method: 'POST',
		headers: getAuthHeaders({ json: true }),
		body: JSON.stringify({
			projectId,
			content,
			mode,
			model: options?.model,
			attachments: options?.attachments,
		}),
		signal: options?.signal,
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
