import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { terminalApi } from '../../services/terminalApi'
import type { TerminalClientMessage, TerminalServerMessage } from '@shared/types/terminal'
import '../../styles/terminal.css'

type TerminalPaneProps = {
	sessionId: string
	isActive: boolean
}

export function TerminalPane({ sessionId, isActive }: TerminalPaneProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const termRef = useRef<Terminal | null>(null)
	const fitAddonRef = useRef<FitAddon | null>(null)
	const wsRef = useRef<WebSocket | null>(null)

	useEffect(() => {
		if (!containerRef.current) return

		const term = new Terminal({
			cursorBlink: true,
			cursorStyle: 'block',
			fontSize: 13,
			fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", "Fira Code", Menlo, monospace',
			theme: {
				background: '#09090b',
				foreground: '#e5e4e8',
				cursor: '#8b7ac8',
				cursorAccent: '#09090b',
				selectionBackground: 'rgba(139, 122, 200, 0.35)',
				black: '#16161c',
				red: '#f87171',
				green: '#34d399',
				yellow: '#c6a65b',
				blue: '#818cf8',
				magenta: '#8b7ac8',
				cyan: '#38bdf8',
				white: '#e5e4e8',
				brightBlack: '#63616d',
				brightRed: '#fca5a5',
				brightGreen: '#6ee7b7',
				brightYellow: '#fde68a',
				brightBlue: '#a5b4fc',
				brightMagenta: '#c4b5fd',
				brightCyan: '#7dd3fc',
				brightWhite: '#ffffff',
			},
			convertEol: true,
			scrollback: 5000,
		})

		const fitAddon = new FitAddon()
		const webLinksAddon = new WebLinksAddon()

		term.loadAddon(fitAddon)
		term.loadAddon(webLinksAddon)
		term.open(containerRef.current)

		termRef.current = term
		fitAddonRef.current = fitAddon

		// Connect WebSocket to persistent session
		const wsUrl = terminalApi.getWebSocketUrl(sessionId)
		const ws = new WebSocket(wsUrl)
		wsRef.current = ws

		ws.onopen = () => {
			// Send initial dimensions
			try {
				fitAddon.fit()
				if (term.cols > 0 && term.rows > 0) {
					ws.send(
						JSON.stringify({
							type: 'resize',
							cols: term.cols,
							rows: term.rows,
						} satisfies TerminalClientMessage),
					)
				}
			} catch {
				// ignore
			}
		}

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data) as TerminalServerMessage
				if (msg.type === 'output' || msg.type === 'history') {
					term.write(msg.data)
				} else if (msg.type === 'exit') {
					term.writeln(`\r\n[Process completed with code ${msg.code}]`)
				} else if (msg.type === 'error') {
					term.writeln(`\r\n\x1b[31m[Error: ${msg.message}]\x1b[0m`)
				}
			} catch {
				// plain text fallback
				term.write(event.data)
			}
		}

		ws.onerror = () => {
			term.writeln('\r\n\x1b[31m[Connection error with laptop worker]\x1b[0m')
		}

		ws.onclose = () => {
			// ws closed
		}

		// User input -> WebSocket
		const dataListener = term.onData((data) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(
					JSON.stringify({
						type: 'input',
						data,
					} satisfies TerminalClientMessage),
				)
			}
		})

		// Handle resize
		const handleResize = () => {
			if (!isActive || !containerRef.current) return
			try {
				fitAddon.fit()
				if (ws.readyState === WebSocket.OPEN && term.cols > 0 && term.rows > 0) {
					ws.send(
						JSON.stringify({
							type: 'resize',
							cols: term.cols,
							rows: term.rows,
						} satisfies TerminalClientMessage),
					)
				}
			} catch {
				// ignore
			}
		}

		window.addEventListener('resize', handleResize)

		// Initial fit
		setTimeout(handleResize, 50)
		setTimeout(handleResize, 300)

		return () => {
			dataListener.dispose()
			window.removeEventListener('resize', handleResize)
			ws.close()
			term.dispose()
			termRef.current = null
			fitAddonRef.current = null
		}
	}, [sessionId])

	// Re-fit and focus when tab becomes active
	useEffect(() => {
		if (isActive && fitAddonRef.current && termRef.current) {
			setTimeout(() => {
				try {
					fitAddonRef.current?.fit()
					termRef.current?.focus()
					if (
						wsRef.current?.readyState === WebSocket.OPEN &&
						termRef.current &&
						termRef.current.cols > 0 &&
						termRef.current.rows > 0
					) {
						wsRef.current.send(
							JSON.stringify({
								type: 'resize',
								cols: termRef.current.cols,
								rows: termRef.current.rows,
							} satisfies TerminalClientMessage),
						)
					}
				} catch {
					// ignore
				}
			}, 50)
		}
	}, [isActive])

	// Helper for accessory keys
	const sendKey = (data: string) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(
				JSON.stringify({
					type: 'input',
					data,
				} satisfies TerminalClientMessage),
			)
		}
		termRef.current?.focus()
	}

	return (
		<div className="terminal-pane-wrapper">
			<div
				className="terminal-pane"
				ref={containerRef}
				style={{ display: isActive ? 'block' : 'none' }}
			/>

			{isActive && (
				<div className="terminal-mobile-bar" aria-label="Terminal keyboard shortcuts">
					<button type="button" className="term-key-btn" onClick={() => sendKey('\x1b')}>
						ESC
					</button>
					<button type="button" className="term-key-btn" onClick={() => sendKey('\t')}>
						TAB
					</button>
					<button
						type="button"
						className="term-key-btn term-key-btn--ctrl"
						onClick={() => sendKey('\x03')}
						title="Interrupt (Ctrl+C)"
					>
						Ctrl+C
					</button>
					<button
						type="button"
						className="term-key-btn"
						onClick={() => sendKey('\x1b[A')}
						title="Up arrow (history)"
					>
						↑
					</button>
					<button
						type="button"
						className="term-key-btn"
						onClick={() => sendKey('\x1b[B')}
						title="Down arrow (history)"
					>
						↓
					</button>
					<button type="button" className="term-key-btn" onClick={() => sendKey('|')}>
						|
					</button>
					<button type="button" className="term-key-btn" onClick={() => sendKey('~')}>
						~
					</button>
					<button type="button" className="term-key-btn" onClick={() => sendKey('/')}>
						/
					</button>
					<button type="button" className="term-key-btn" onClick={() => sendKey('-')}>
						-
					</button>
					<button
						type="button"
						className="term-key-btn"
						onClick={() => {
							termRef.current?.clear()
							sendKey('\x0c')
						}}
						title="Clear terminal screen"
					>
						Clear
					</button>
				</div>
			)}
		</div>
	)
}
