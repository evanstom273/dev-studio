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

// Register PWA service worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('./sw.js').catch((err) => {
			console.warn('PWA service worker registration failed:', err)
		})
	})
}

