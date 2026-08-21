import { useEffect, useState } from 'react'

type ViewportState = {
	height: number
	offsetTop: number
	keyboardOpen: boolean
}

export function useVisualViewport(): ViewportState {
	const [state, setState] = useState<ViewportState>(() => ({
		height: typeof window !== 'undefined' ? window.innerHeight : 0,
		offsetTop: 0,
		keyboardOpen: false,
	}))

	useEffect(() => {
		const viewport = window.visualViewport
		if (!viewport) return

		const update = () => {
			const keyboardOpen = viewport.height < window.innerHeight * 0.75
			setState({
				height: viewport.height,
				offsetTop: viewport.offsetTop,
				keyboardOpen,
			})
		}

		update()
		viewport.addEventListener('resize', update)
		viewport.addEventListener('scroll', update)
		return () => {
			viewport.removeEventListener('resize', update)
			viewport.removeEventListener('scroll', update)
		}
	}, [])

	return state
}
