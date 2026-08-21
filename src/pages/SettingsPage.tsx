import { useState } from 'react'
import { useConnection } from '../hooks/useConnection'
import { ConnectionBanner } from '../components/ConnectionBanner'
import '../styles/settings.css'

type SettingsPageProps = {
	onBack: () => void
}

export function SettingsPage({ onBack }: SettingsPageProps) {
	const { config, connect, disconnect, state } = useConnection()
	const [backendUrl, setBackendUrl] = useState(config.backendUrl)
	const [token, setToken] = useState(config.token)
	const [saving, setSaving] = useState(false)

	const handleSave = async () => {
		setSaving(true)
		try {
			await connect({ backendUrl: backendUrl.trim(), token: token.trim() })
		} finally {
			setSaving(false)
		}
	}

	return (
		<main className="settings-page">
			<header className="settings-page__header">
				<button type="button" className="settings-page__back" onClick={onBack}>
					← Back
				</button>
				<h1 className="settings-page__title">Connection</h1>
			</header>

			<ConnectionBanner />

			<section className="settings-section">
				<h2 className="settings-section__title">Laptop Backend</h2>
				<p className="settings-section__desc">
					Enter your laptop&apos;s Tailscale URL. Example:{' '}
					<code>http://my-laptop.tail-xxxxx.ts.net:3847</code>
				</p>

				<label className="field">
					<span className="field__label">Backend URL</span>
					<input
						className="field__input"
						type="url"
						value={backendUrl}
						onChange={(e) => setBackendUrl(e.target.value)}
						placeholder="http://laptop.tail-xxxxx.ts.net:3847"
					/>
				</label>

				<label className="field">
					<span className="field__label">Access Token</span>
					<input
						className="field__input"
						type="password"
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder="Same as DEV_STUDIO_TOKEN on laptop"
					/>
				</label>

				<div className="settings-actions">
					<button type="button" className="btn btn--primary" onClick={() => void handleSave()} disabled={saving}>
						{saving ? 'Connecting...' : 'Save & Connect'}
					</button>
					<button type="button" className="btn btn--ghost" onClick={disconnect}>
						Disconnect
					</button>
				</div>
			</section>

			{state.status === 'connected' && (
				<section className="settings-section">
					<h2 className="settings-section__title">Backend Status</h2>
					<ul className="status-list">
						<li className={`status-list__item${state.health.agy.available ? ' is-ok' : ''}`}>
							Antigravity CLI: {state.health.agy.available ? state.health.agy.version : 'Not found'}
							{state.health.agy.authenticated === false && ' — sign in required'}
						</li>
						<li className={`status-list__item${state.health.git.available ? ' is-ok' : ''}`}>
							Git: {state.health.git.available ? 'Available' : 'Not found'}
						</li>
						<li className={`status-list__item${state.health.github.available ? ' is-ok' : ''}`}>
							GitHub API: {state.health.github.authenticated ? `@${state.health.github.version}` : state.health.github.message ?? 'Not configured'}
						</li>
					</ul>
				</section>
			)}
		</main>
	)
}
