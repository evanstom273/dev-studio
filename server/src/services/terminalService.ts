import * as pty from 'node-pty'
import type { WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import type {
	CreateTerminalSessionRequest,
	TerminalClientMessage,
	TerminalServerMessage,
	TerminalSessionInfo,
} from '../types/terminal.js'

const MAX_HISTORY_CHARS = 50_000

export type ActiveTerminalSession = {
	info: TerminalSessionInfo
	pty: pty.IPty
	historyBuffer: string
	clients: Set<WebSocket>
}

export class TerminalSessionManager {
	private sessions = new Map<string, ActiveTerminalSession>()

	private getShell(): string {
		if (process.platform === 'win32') {
			return process.env.SHELL || 'powershell.exe'
		}
		return process.env.SHELL || '/bin/bash'
	}

	createSession(
		projectId: string,
		projectPath: string,
		req?: CreateTerminalSessionRequest,
	): TerminalSessionInfo {
		const id = `term_${Date.now()}_${randomUUID().slice(0, 6)}`
		const cwd = req?.cwd || projectPath
		const shell = this.getShell()
		const shellArgs: string[] = process.platform === 'win32' && shell.toLowerCase().includes('powershell')
			? ['-NoLogo']
			: []

		const ptyProcess = pty.spawn(shell, shellArgs, {
			name: 'xterm-256color',
			cols: 80,
			rows: 24,
			cwd,
			env: {
				...process.env,
				TERM: 'xterm-256color',
				COLORTERM: 'truecolor',
			},
		})

		const now = new Date().toISOString()
		const title = req?.title?.trim() || `Terminal ${this.listSessions(projectId).length + 1}`

		const info: TerminalSessionInfo = {
			id,
			projectId,
			title,
			cwd,
			createdAt: now,
			lastActive: now,
		}

		const session: ActiveTerminalSession = {
			info,
			pty: ptyProcess,
			historyBuffer: '',
			clients: new Set(),
		}

		ptyProcess.onData((data: string) => {
			session.historyBuffer += data
			if (session.historyBuffer.length > MAX_HISTORY_CHARS) {
				session.historyBuffer = session.historyBuffer.slice(
					session.historyBuffer.length - MAX_HISTORY_CHARS,
				)
			}
			session.info.lastActive = new Date().toISOString()

			const msg = JSON.stringify({ type: 'output', data } satisfies TerminalServerMessage)
			for (const client of session.clients) {
				if (client.readyState === 1) {
					// OPEN
					client.send(msg)
				}
			}
		})

		ptyProcess.onExit(({ exitCode }) => {
			const msg = JSON.stringify({ type: 'exit', code: exitCode } satisfies TerminalServerMessage)
			for (const client of session.clients) {
				if (client.readyState === 1) {
					client.send(msg)
				}
			}
			this.sessions.delete(id)
		})

		this.sessions.set(id, session)
		return info
	}

	listSessions(projectId: string): TerminalSessionInfo[] {
		const results: TerminalSessionInfo[] = []
		for (const session of this.sessions.values()) {
			if (session.info.projectId === projectId) {
				results.push(session.info)
			}
		}
		return results.sort(
			(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		)
	}

	getSession(id: string): ActiveTerminalSession | undefined {
		return this.sessions.get(id)
	}

	getOrCreateDefaultSession(projectId: string, projectPath: string): TerminalSessionInfo {
		const existing = this.listSessions(projectId)
		if (existing.length > 0) {
			return existing[0]
		}
		return this.createSession(projectId, projectPath, { title: 'Terminal 1' })
	}

	addClient(sessionId: string, ws: WebSocket): boolean {
		const session = this.sessions.get(sessionId)
		if (!session) return false

		session.clients.add(ws)
		session.info.lastActive = new Date().toISOString()

		// Send backlog history immediately to this new client
		if (session.historyBuffer) {
			ws.send(
				JSON.stringify({
					type: 'history',
					data: session.historyBuffer,
				} satisfies TerminalServerMessage),
			)
		}

		return true
	}

	removeClient(sessionId: string, ws: WebSocket): void {
		const session = this.sessions.get(sessionId)
		if (session) {
			session.clients.delete(ws)
		}
	}

	handleMessage(sessionId: string, message: TerminalClientMessage): void {
		const session = this.sessions.get(sessionId)
		if (!session) return

		session.info.lastActive = new Date().toISOString()

		switch (message.type) {
			case 'input':
				session.pty.write(message.data)
				break
			case 'resize':
				if (message.cols > 0 && message.rows > 0) {
					try {
						session.pty.resize(message.cols, message.rows)
					} catch {
						// ignore resize errors if pty already closed
					}
				}
				break
			case 'rename':
				if (message.title?.trim()) {
					session.info.title = message.title.trim()
				}
				break
		}
	}

	killSession(sessionId: string): boolean {
		const session = this.sessions.get(sessionId)
		if (!session) return false

		try {
			session.pty.kill()
		} catch {
			// ignore error
		}

		for (const client of session.clients) {
			if (client.readyState === 1) {
				client.send(
					JSON.stringify({ type: 'exit', code: 0 } satisfies TerminalServerMessage),
				)
			}
		}
		this.sessions.delete(sessionId)
		return true
	}

	renameSession(sessionId: string, title: string): TerminalSessionInfo | null {
		const session = this.sessions.get(sessionId)
		if (!session) return null
		session.info.title = title.trim() || session.info.title
		return session.info
	}
}
