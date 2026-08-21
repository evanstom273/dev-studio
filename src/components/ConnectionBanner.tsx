import { useConnection } from '../hooks/useConnection'
import '../styles/connection.css'

export function ConnectionBanner() {
	const { state, refresh } = useConnection()

	if (state.status === 'connected') return null

	const message =
		state.status === 'disconnected'
			? 'Not connected to laptop backend'
			: state.status === 'connecting'
				? 'Connecting...'
				: state.message

	return (
		<div className={`connection-banner connection-banner--${state.status}`}>
			<span className="connection-banner__text">{message}</span>
			{state.status === 'error' && (
				<button type="button" className="connection-banner__retry" onClick={() => void refresh()}>
					Retry
				</button>
			)}
		</div>
	)
}
