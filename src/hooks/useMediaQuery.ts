import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => {
		if (typeof window === 'undefined') return false
		return window.matchMedia(query).matches
	})

	useEffect(() => {
		const media = window.matchMedia(query)
		const handler = (event: MediaQueryListEvent) => setMatches(event.matches)
		setMatches(media.matches)
		media.addEventListener('change', handler)
		return () => media.removeEventListener('change', handler)
	}, [query])

	return matches
}

export function useWideLayout(): boolean {
	return useMediaQuery('(min-width: 768px)')
}

export function useDesktopLayout(): boolean {
	return useMediaQuery('(min-width: 1024px)')
}
