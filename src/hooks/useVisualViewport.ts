import { useEffect, useState } from 'react'

type ViewportState = {
	height: number
	offsetTop: number
	keyboardOpen: boolean
	keyboardInset: number
}

const KEYBOARD_INSET_THRESHOLD = 72

function syncViewportVars(height: number, offsetTop: number, keyboardOpen: boolean, keyboardInset: number): void {
	const root = document.documentElement
	root.style.setProperty('--vv-height', `${height}px`)
	root.style.setProperty('--vv-offset-top', `${offsetTop}px`)
	root.style.setProperty('--vv-keyboard-inset', `${keyboardInset}px`)
	root.classList.toggle('ds-keyboard-open', keyboardOpen)
}

function clearViewportVars(): void {
	const root = document.documentElement
	root.classList.remove('ds-keyboard-open')
	root.style.removeProperty('--vv-height')
	root.style.removeProperty('--vv-offset-top')
	root.style.removeProperty('--vv-keyboard-inset')
}

export function useVisualViewport(): ViewportState {
	const [state, setState] = useState<ViewportState>(() => ({
		height: typeof window !== 'undefined' ? window.innerHeight : 0,
		offsetTop: 0,
		keyboardOpen: false,
		keyboardInset: 0,
	}))

	useEffect(() => {
		const viewport = window.visualViewport
		if (!viewport) return

		const update = () => {
			const keyboardInset = Math.max(0, Math.round(window.innerHeight - viewport.height))
			const keyboardOpen = keyboardInset >= KEYBOARD_INSET_THRESHOLD
			const height = viewport.height
			const offsetTop = viewport.offsetTop

			syncViewportVars(height, offsetTop, keyboardOpen, keyboardInset)
			setState({ height, offsetTop, keyboardOpen, keyboardInset })
		}

		update()
		viewport.addEventListener('resize', update)
		viewport.addEventListener('scroll', update)
		window.addEventListener('orientationchange', update)

		return () => {
			viewport.removeEventListener('resize', update)
			viewport.removeEventListener('scroll', update)
			window.removeEventListener('orientationchange', update)
			clearViewportVars()
		}
	}, [])

	return state
}
