import { useEffect, useState } from 'react'
import { Field, GhInput, Sheet, SheetActions } from '../github/GitHubUi'
import { useConnection } from '../../hooks/useConnection'
import { projectsApi } from '../../services/gitApi'
import type { Project } from '@shared/types/project'

type ConnectSheetProps = {
	open: boolean
	onClose: () => void
}

export function ConnectSheet({ open, onClose }: ConnectSheetProps) {
	const { connect, config } = useConnection()
	const [backendUrl, setBackendUrl] = useState('')
	const [githubToken, setGithubToken] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState('')

	useEffect(() => {
		if (open) {
			setBackendUrl(config.backendUrl.replace(/:3847$/, ''))
			setGithubToken(config.githubToken)
		}
	}, [open, config.backendUrl, config.githubToken])

	const handleConnect = async () => {
		setSaving(true)
		setError('')
		try {
			const url = backendUrl.trim().replace(/:3847$/, '')
			await connect({
				backendUrl: url,
				token: '',
				githubToken: githubToken.trim(),
			})
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Connection failed')
		} finally {
			setSaving(false)
		}
	}

	return (
		<Sheet open={open} title="Connect to laptop" onClose={onClose}>
			<p className="hub-sheet__intro">
				Dev Studio runs Antigravity on your laptop. Pick repos from GitHub — they open in a
				temporary workspace on the laptop and sync back when you push.
			</p>

			{error && <div className="panel-message">{error}</div>}

			<Field
				label="Laptop address"
				hint="From Tailscale: https://your-laptop.tail-xxxxx.ts.net — no :3847"
			>
				<GhInput
					type="url"
					value={backendUrl}
					onChange={(e) => setBackendUrl(e.target.value)}
					placeholder="https://laptop.tail-xxxxx.ts.net"
					autoComplete="off"
				/>
			</Field>

			<Field
				label="GitHub token"
				hint="Fine-grained PAT — stays on this phone only"
			>
				<GhInput
					type="password"
					value={githubToken}
					onChange={(e) => setGithubToken(e.target.value)}
					placeholder="github_pat_…"
					autoComplete="off"
				/>
			</Field>

			<SheetActions>
				<button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
				<button
					type="button"
					className="btn btn--primary"
					disabled={saving || !backendUrl.trim()}
					onClick={() => void handleConnect()}
				>
					{saving ? 'Connecting…' : 'Connect'}
				</button>
			</SheetActions>
		</Sheet>
	)
}

type CreateRepoSheetProps = {
	open: boolean
	onClose: () => void
	onCreated: (project: Project) => void
}

export function CreateRepoSheet({ open, onClose, onCreated }: CreateRepoSheetProps) {
	const [name, setName] = useState('')
	const [description, setDescription] = useState('')
	const [isPrivate, setIsPrivate] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')

	const handleCreate = async () => {
		if (!name.trim()) return
		setBusy(true)
		setError('')
		try {
			const project = await projectsApi.createOnGitHub({
				name: name.trim(),
				description: description.trim() || undefined,
				private: isPrivate,
			})
			onCreated(project)
			onClose()
			setName('')
			setDescription('')
			setIsPrivate(false)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Create failed')
		} finally {
			setBusy(false)
		}
	}

	return (
		<Sheet open={open} title="New repository" onClose={onClose}>
			<p className="hub-sheet__intro">
				Creates the repo on GitHub and opens it ready for the agent. A local workspace is cached on
				your laptop while you work — remove it anytime from Recent.
			</p>

			{error && <div className="panel-message">{error}</div>}

			<Field label="Repository name">
				<GhInput
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="my-project"
					autoComplete="off"
				/>
			</Field>

			<Field label="Description (optional)">
				<GhInput
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="What is this project?"
				/>
			</Field>

			<label className="hub-checkbox">
				<input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
				<span>Private repository</span>
			</label>

			<SheetActions>
				<button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
				<button
					type="button"
					className="btn btn--primary"
					disabled={busy || !name.trim()}
					onClick={() => void handleCreate()}
				>
					{busy ? 'Creating…' : 'Create & open'}
				</button>
			</SheetActions>
		</Sheet>
	)
}
