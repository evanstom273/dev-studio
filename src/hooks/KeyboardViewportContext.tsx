import { createContext, useContext, type ReactNode } from 'react'
import { useVisualViewport } from './useVisualViewport'

type KeyboardViewportState = ReturnType<typeof useVisualViewport>

const KeyboardViewportContext = createContext<KeyboardViewportState | null>(null)

export function KeyboardViewportProvider({ children }: { children: ReactNode }) {
	const viewport = useVisualViewport()
	return (
		<KeyboardViewportContext.Provider value={viewport}>{children}</KeyboardViewportContext.Provider>
	)
}

export function useKeyboardViewport(): KeyboardViewportState {
	const ctx = useContext(KeyboardViewportContext)
	if (!ctx) {
		throw new Error('useKeyboardViewport must be used within KeyboardViewportProvider')
	}
	return ctx
}
