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

/** True when the web UI can open folders on the connected laptop filesystem. */
export function canAccessLocalFilesystem(backendUrl: string): boolean {
	return isTauriApp() || isLocalBackendUrl(backendUrl)
}
