import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function usePwaInstall() {
	const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
	const [isInstallable, setIsInstallable] = useState(false)
	const [isInstalled, setIsInstalled] = useState(false)

	useEffect(() => {
		// Check if already running in standalone/app display mode
		const isStandalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			window.matchMedia('(display-mode: fullscreen)').matches ||
			window.matchMedia('(display-mode: minimal-ui)').matches ||
			(window.navigator as unknown as { standalone?: boolean }).standalone === true ||
			document.referrer.startsWith('android-app://')

		if (isStandalone) {
			setIsInstalled(true)
		}

		const handleBeforeInstall = (e: Event) => {
			e.preventDefault()
			setDeferredPrompt(e as BeforeInstallPromptEvent)
			setIsInstallable(true)
		}

		const handleAppInstalled = () => {
			setIsInstalled(true)
			setIsInstallable(false)
			setDeferredPrompt(null)
		}

		window.addEventListener('beforeinstallprompt', handleBeforeInstall)
		window.addEventListener('appinstalled', handleAppInstalled)

		return () => {
			window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
			window.removeEventListener('appinstalled', handleAppInstalled)
		}
	}, [])

	const install = async () => {
		if (!deferredPrompt) return false
		await deferredPrompt.prompt()
		const choice = await deferredPrompt.userChoice
		if (choice.outcome === 'accepted') {
			setIsInstalled(true)
			setIsInstallable(false)
			setDeferredPrompt(null)
			return true
		}
		return false
	}

	return { isInstallable, isInstalled, install }
}
