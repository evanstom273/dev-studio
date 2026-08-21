import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/global.css'
import './styles/layout.css'
import './styles/connection.css'
import './styles/settings.css'
import './styles/repo.css'
import './styles/github.css'

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)

// Register PWA service worker with auto-update
if ('serviceWorker' in navigator && import.meta.env.PROD) {
	window.addEventListener('load', () => {
		navigator.serviceWorker
			.register('./sw.js')
			.then((reg) => {
				reg.update().catch(() => {})
			})
			.catch((err) => {
				console.warn('PWA service worker registration failed:', err)
			})

		let refreshing = false
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (!refreshing) {
				refreshing = true
				window.location.reload()
			}
		})
	})
}
