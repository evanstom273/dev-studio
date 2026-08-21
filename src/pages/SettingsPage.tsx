import { useState } from 'react'
import type { ServerUpdateResult } from '@shared/types/system'
import { useConnection } from '../hooks/useConnection'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { systemApi } from '../services/systemApi'
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
	const [updating, setUpdating] = useState(false)
	const [updateResult, setUpdateResult] = useState<ServerUpdateResult | null>(null)
	const [updateError, setUpdateError] = useState<string | null>(null)

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

	const handleUpdateRestart = async () => {
		if (
			!confirm(
				'Pull latest dev-studio from git, rebuild the server, and restart it on your laptop?\n\nThe connection will drop briefly. Wait ~30 seconds, then tap Save & Connect again if needed.',
			)
		) {
			return
		}

		setUpdating(true)
		setUpdateError(null)
		setUpdateResult(null)
		try {
			const result = await systemApi.updateAndRestart()
			setUpdateResult(result)
			if (!result.ok) {
				setUpdateError(result.error ?? 'Update failed')
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Update request failed'
			setUpdateError(message)
			if (message.includes('fetch') || message.includes('network')) {
				setUpdateError(`${message} — the server may already be restarting. Wait and reconnect.`)
			}
		} finally {
			setUpdating(false)
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
						placeholder="https://laptop.tail-xxxxx.ts.net"
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

			{state.status === 'connected' && (
				<section className="settings-section">
					<h2 className="settings-section__title">Update Laptop Backend</h2>
					<p className="settings-section__desc">
						Pulls the latest <code>dev-studio</code> code on your laptop, rebuilds the server, and
						restarts it. Use this after merging PRs so your phone gets the newest backend without
						typing commands on the laptop.
					</p>
					<p className="settings-section__desc">
						On Windows, a new terminal window opens for the restarted server. Set{' '}
						<code>DEV_STUDIO_RESTART_COMMAND=npm run dev:server</code> on the laptop if you use dev
						mode.
					</p>
					<div className="settings-actions">
						<button
							type="button"
							className="btn btn--primary"
							onClick={() => void handleUpdateRestart()}
							disabled={updating}
						>
							{updating ? 'Updating…' : 'Pull, rebuild & restart'}
						</button>
					</div>
					{updateError && <p className="settings-update-error">{updateError}</p>}
					{updateResult?.ok && updateResult.restarting && (
						<p className="settings-update-ok">
							Update complete — server is restarting. Reconnect in ~30 seconds.
						</p>
					)}
					{updateResult && updateResult.steps.length > 0 && (
						<ul className="settings-update-steps">
							{updateResult.steps.map((step) => (
								<li
									key={step.name}
									className={`settings-update-steps__item${step.exitCode === 0 ? ' is-ok' : ' is-error'}`}
								>
									{step.name} {step.exitCode === 0 ? '✓' : `(exit ${step.exitCode})`}
								</li>
							))}
						</ul>
					)}
				</section>
			)}
		</main>
	)
}
