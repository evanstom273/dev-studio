export function isTauriApp(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isLocalBackendUrl(url: string): boolean {
	if (!url.trim()) return false
	try {
		const parsed = new URL(url)
		const host = parsed.hostname.toLowerCase()
		return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
	} catch {
		return false
	}
}

export function isLocalWebClient(): boolean {
	if (typeof window === 'undefined') return false
	const host = window.location.hostname.toLowerCase()
	return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

export function supportsNativeFolderPicker(): boolean {
	return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

/** Open Local Folder uses server-side browse — available whenever the laptop backend is connected. */
export function canOpenLocalFolder(connected: boolean, backendUrl: string): boolean {
	return connected && Boolean(backendUrl.trim())
}
