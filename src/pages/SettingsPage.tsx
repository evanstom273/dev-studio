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
	const [githubToken, setGithubToken] = useState(config.githubToken)
	const [saving, setSaving] = useState(false)

	const handleSave = async () => {
		setSaving(true)
		try {
			await connect({
				backendUrl: backendUrl.trim(),
				token: token.trim(),
				githubToken: githubToken.trim(),
			})
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
					Your laptop runs the Dev Studio server, Antigravity (<code>agy</code>), and git.
					Enter its Tailscale address below.
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
					<span className="field__label">Access Token (optional)</span>
					<input
						className="field__input"
						type="password"
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder="Leave blank unless you set DEV_STUDIO_TOKEN on laptop"
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

			<section className="settings-section">
				<h2 className="settings-section__title">GitHub</h2>
				<p className="settings-section__desc">
					Your fine-grained PAT stays on this phone. It is sent to your laptop over Tailscale
					only when you use GitHub features — it is not saved on the laptop.
				</p>

				<label className="field">
					<span className="field__label">GitHub Personal Access Token</span>
					<input
						className="field__input"
						type="password"
						value={githubToken}
						onChange={(e) => setGithubToken(e.target.value)}
						placeholder="github_pat_…"
						autoComplete="off"
					/>
				</label>

				<div className="settings-actions">
					<button type="button" className="btn btn--primary" onClick={() => void handleSave()} disabled={saving}>
						{saving ? 'Saving...' : 'Save GitHub Token'}
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
						<li className={`status-list__item${state.health.github.authenticated ? ' is-ok' : ''}`}>
							GitHub API: {state.health.github.authenticated ? `@${state.health.github.version}` : state.health.github.message ?? 'Add token above'}
						</li>
					</ul>
				</section>
			)}
		</main>
	)
}
