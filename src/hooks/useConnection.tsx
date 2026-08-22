import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ConnectionConfig, ConnectionState } from '@shared/types/connection'
import {
	ApiClientError,
	checkHealth,
	loadConnectionConfig,
	saveConnectionConfig,
} from '../services/apiClient'

type ConnectionContextValue = {
	state: ConnectionState
	config: ConnectionConfig
	connect: (config: ConnectionConfig) => Promise<void>
	disconnect: () => void
	refresh: () => Promise<void>
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null)

// Candidate addresses to test if no backend URL is set
const CANDIDATE_URLS = [
	'http://localhost:3847',
	'http://127.0.0.1:3847',
]

export function ConnectionProvider({ children }: { children: ReactNode }) {
	const [config, setConfig] = useState<ConnectionConfig>(() => loadConnectionConfig())
	const [state, setState] = useState<ConnectionState>({ status: 'connecting' })
	const isProbingRef = useRef(false)

	const refresh = useCallback(async () => {
		const current = loadConnectionConfig()

		// 1. If backendUrl is set, ping it directly
		if (current.backendUrl) {
			setState((prev) => (prev.status === 'connected' ? prev : { status: 'connecting' }))
			try {
				const health = await checkHealth()
				setState({ status: 'connected', health })
				return
			} catch (error) {
				const message = error instanceof ApiClientError ? error.message : 'Connection failed'
				setState({ status: 'error', message })
				return
			}
		}

		// 2. If no backendUrl, probe candidate servers in the background
		if (isProbingRef.current) return
		isProbingRef.current = true
		setState({ status: 'connecting' })

		const candidates = [...CANDIDATE_URLS]
		if (
			typeof window !== 'undefined' &&
			!window.location.hostname.includes('github.io') &&
			!window.location.hostname.includes('tauri.localhost') &&
			window.location.protocol !== 'tauri:'
		) {
			candidates.unshift(window.location.origin)
		}

		for (const candidate of candidates) {
			try {
				const health = await checkHealth(candidate)
				if (health.status === 'ok') {
					const newConfig = { ...current, backendUrl: candidate }
					saveConnectionConfig(newConfig)
					setConfig(newConfig)
					setState({ status: 'connected', health })
					isProbingRef.current = false
					return
				}
			} catch {
				// try next candidate
			}
		}

		isProbingRef.current = false
		setState({ status: 'disconnected' })
	}, [])

	const connect = useCallback(
		async (newConfig: ConnectionConfig) => {
			saveConnectionConfig(newConfig)
			setConfig(newConfig)
			await refresh()
		},
		[refresh],
	)

	const disconnect = useCallback(() => {
		saveConnectionConfig({ backendUrl: '', token: '', githubToken: '' })
		setConfig({ backendUrl: '', token: '', githubToken: '' })
		setState({ status: 'disconnected' })
	}, [])

	// Auto-connect on launch
	useEffect(() => {
		void refresh()
	}, [refresh])

	// Auto-reconnect loop: retry every 4s when disconnected or on error
	useEffect(() => {
		const interval = setInterval(() => {
			if (state.status !== 'connected') {
				void refresh()
			}
		}, 4000)
		return () => clearInterval(interval)
	}, [state.status, refresh])

	// Reconnect immediately on tab focus or visibility change
	useEffect(() => {
		const handleFocus = () => {
			if (state.status !== 'connected') {
				void refresh()
			}
		}
		window.addEventListener('focus', handleFocus)
		document.addEventListener('visibilitychange', handleFocus)
		return () => {
			window.removeEventListener('focus', handleFocus)
			document.removeEventListener('visibilitychange', handleFocus)
		}
	}, [state.status, refresh])

	return (
		<ConnectionContext.Provider value={{ state, config, connect, disconnect, refresh }}>
			{children}
		</ConnectionContext.Provider>
	)
}

export function useConnection(): ConnectionContextValue {
	const ctx = useContext(ConnectionContext)
	if (!ctx) throw new Error('useConnection must be used within ConnectionProvider')
	return ctx
}
