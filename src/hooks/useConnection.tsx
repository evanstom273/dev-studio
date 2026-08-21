import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ConnectionConfig, ConnectionState } from '@shared/types/connection'
import { ApiClientError, checkHealth, loadConnectionConfig, saveConnectionConfig } from '../services/apiClient'

type ConnectionContextValue = {
	state: ConnectionState
	config: ConnectionConfig
	connect: (config: ConnectionConfig) => Promise<void>
	disconnect: () => void
	refresh: () => Promise<void>
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null)

export function ConnectionProvider({ children }: { children: ReactNode }) {
	const [config, setConfig] = useState<ConnectionConfig>(() => loadConnectionConfig())
	const [state, setState] = useState<ConnectionState>({ status: 'disconnected' })

	const refresh = useCallback(async () => {
		const current = loadConnectionConfig()
		if (!current.backendUrl) {
			setState({ status: 'disconnected' })
			return
		}

		setState({ status: 'connecting' })
		try {
			const health = await checkHealth()
			setState({ status: 'connected', health })
		} catch (error) {
			const message = error instanceof ApiClientError ? error.message : 'Connection failed'
			setState({ status: 'error', message })
		}
	}, [])

	const connect = useCallback(async (newConfig: ConnectionConfig) => {
		saveConnectionConfig(newConfig)
		setConfig(newConfig)
		await refresh()
	}, [refresh])

	const disconnect = useCallback(() => {
		saveConnectionConfig({ backendUrl: '', token: '', githubToken: '' })
		setConfig({ backendUrl: '', token: '', githubToken: '' })
		setState({ status: 'disconnected' })
	}, [])

	useEffect(() => {
		if (config.backendUrl) {
			void refresh()
		}
	}, [config.backendUrl, config.githubToken, refresh])

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
