import { useEffect, useState } from 'react'
import type { PermissionRequest } from '@shared/types/agent'
import { permissionsApi } from '../services/githubApi'
import '../styles/connection.css'

type PermissionPromptProps = {
	projectId: string
	incoming?: PermissionRequest[]
}

export function PermissionPrompt({ projectId, incoming = [] }: PermissionPromptProps) {
	const [pending, setPending] = useState<PermissionRequest[]>([])

	useEffect(() => {
		const poll = async () => {
			try {
				const items = await permissionsApi.list(projectId)
				setPending(items.filter((p) => p.status === 'pending'))
			} catch {
				// backend unavailable
			}
		}

		void poll()
		const interval = setInterval(() => void poll(), 1000)
		return () => clearInterval(interval)
	}, [projectId])

	useEffect(() => {
		if (incoming.length === 0) return
		setPending((prev) => {
			const merged = [...prev]
			for (const item of incoming) {
				if (item.status !== 'pending') continue
				if (!merged.some((p) => p.id === item.id)) {
					merged.push(item)
				}
			}
			return merged
		})
	}, [incoming])

	if (pending.length === 0) return null

	const current = pending[0]

	const respond = async (approved: boolean) => {
		if (approved) await permissionsApi.approve(current.id)
		else await permissionsApi.deny(current.id)
		setPending((prev) => prev.filter((p) => p.id !== current.id))
	}

	return (
		<div className="permission-prompt">
			<div className="permission-prompt__header">Agent permission request</div>
			<p className="permission-prompt__desc">{current.description}</p>
			<div className="permission-prompt__actions">
				<button type="button" className="btn btn--danger" onClick={() => void respond(false)}>
					Deny
				</button>
				<button type="button" className="btn btn--primary" onClick={() => void respond(true)}>
					Allow
				</button>
			</div>
		</div>
	)
}
