import { useCallback, useEffect, useRef, useState } from 'react'

export interface SpeechRecognitionEvent extends Event {
	resultIndex: number
	results: SpeechRecognitionResultList
}

export interface SpeechRecognitionResultList {
	length: number
	item(index: number): SpeechRecognitionResult
	[index: number]: SpeechRecognitionResult
}

export interface SpeechRecognitionResult {
	isFinal: boolean
	length: number
	item(index: number): SpeechRecognitionAlternative
	[index: number]: SpeechRecognitionAlternative
}

export interface SpeechRecognitionAlternative {
	transcript: string
	confidence: number
}

export interface SpeechRecognitionErrorEvent extends Event {
	error: string
	message?: string
}

export interface ISpeechRecognition extends EventTarget {
	continuous: boolean
	interimResults: boolean
	lang: string
	maxAlternatives: number
	start(): void
	stop(): void
	abort(): void
	onresult: ((event: SpeechRecognitionEvent) => void) | null
	onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
	onend: (() => void) | null
	onstart: (() => void) | null
	onaudiostart: (() => void) | null
	onaudioend: (() => void) | null
	onspeechstart: (() => void) | null
	onspeechend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => ISpeechRecognition

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
	if (typeof window === 'undefined') return undefined
	const win = window as unknown as {
		SpeechRecognition?: SpeechRecognitionConstructor
		webkitSpeechRecognition?: SpeechRecognitionConstructor
	}
	return win.SpeechRecognition || win.webkitSpeechRecognition
}

export type UseSpeechRecognitionOptions = {
	onResult?: (finalText: string) => void
	onInterim?: (interimText: string) => void
	onError?: (errorMessage: string) => void
	lang?: string
	continuous?: boolean
}

export function useSpeechRecognition({
	onResult,
	onInterim,
	onError,
	lang,
	continuous = true,
}: UseSpeechRecognitionOptions = {}) {
	const [isListening, setIsListening] = useState(false)
	const [interimText, setInterimText] = useState('')
	const [error, setError] = useState<string | null>(null)
	const recognitionRef = useRef<ISpeechRecognition | null>(null)
	const shouldBeListeningRef = useRef(false)
	const restartTimeoutRef = useRef<number | null>(null)

	const isSupported = typeof window !== 'undefined' && Boolean(getSpeechRecognitionConstructor())

	// Store callbacks in refs to avoid re-binding
	const onResultRef = useRef(onResult)
	onResultRef.current = onResult
	const onInterimRef = useRef(onInterim)
	onInterimRef.current = onInterim
	const onErrorRef = useRef(onError)
	onErrorRef.current = onError

	const cleanup = useCallback(() => {
		if (restartTimeoutRef.current) {
			window.clearTimeout(restartTimeoutRef.current)
			restartTimeoutRef.current = null
		}
		if (recognitionRef.current) {
			try {
				recognitionRef.current.onresult = null
				recognitionRef.current.onerror = null
				recognitionRef.current.onend = null
				recognitionRef.current.onstart = null
				recognitionRef.current.abort()
			} catch {
				// ignore abort error
			}
			recognitionRef.current = null
		}
		setIsListening(false)
		setInterimText('')
	}, [])

	const stopListening = useCallback(() => {
		shouldBeListeningRef.current = false
		if (restartTimeoutRef.current) {
			window.clearTimeout(restartTimeoutRef.current)
			restartTimeoutRef.current = null
		}
		if (recognitionRef.current) {
			try {
				recognitionRef.current.stop()
			} catch {
				// ignore stop error
			}
		}
		setIsListening(false)
		setInterimText('')
	}, [])

	const startListening = useCallback(() => {
		const Constructor = getSpeechRecognitionConstructor()
		if (!Constructor) {
			const msg = 'Speech recognition is not supported in this browser.'
			setError(msg)
			onErrorRef.current?.(msg)
			return
		}

		cleanup()
		setError(null)
		setInterimText('')
		shouldBeListeningRef.current = true

		try {
			const recognition = new Constructor()
			recognition.continuous = continuous
			recognition.interimResults = true
			recognition.lang =
				lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US'

			recognition.onstart = () => {
				setIsListening(true)
			}

			recognition.onresult = (event: SpeechRecognitionEvent) => {
				let finalChunk = ''
				let currentInterim = ''

				for (let i = event.resultIndex; i < event.results.length; i++) {
					const res = event.results[i]
					const text = res[0]?.transcript || ''
					if (res.isFinal) {
						finalChunk += text
					} else {
						currentInterim += text
					}
				}

				if (finalChunk.trim()) {
					onResultRef.current?.(finalChunk.trim())
				}

				setInterimText(currentInterim)
				onInterimRef.current?.(currentInterim)
			}

			recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
				let userMsg = ''
				if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
					userMsg = 'Microphone permission denied. Please allow microphone access in your browser.'
					shouldBeListeningRef.current = false
					setIsListening(false)
				} else if (event.error === 'no-speech') {
					// No speech detected, keep listening if user intended
					return
				} else if (event.error === 'network') {
					userMsg = 'Speech recognition network error. Please check your connection.'
				} else if (event.error === 'audio-capture') {
					userMsg = 'No microphone was found or audio capture failed.'
					shouldBeListeningRef.current = false
					setIsListening(false)
				} else if (event.error === 'aborted') {
					return
				} else {
					userMsg = `Speech recognition error: ${event.error}`
				}

				setError(userMsg)
				onErrorRef.current?.(userMsg)
			}

			recognition.onend = () => {
				setInterimText('')
				// If user still wants to listen (e.g. browser auto-stopped on mobile), auto-restart
				if (shouldBeListeningRef.current) {
					restartTimeoutRef.current = window.setTimeout(() => {
						if (shouldBeListeningRef.current) {
							try {
								recognition.start()
							} catch {
								setIsListening(false)
								shouldBeListeningRef.current = false
							}
						}
					}, 200)
				} else {
					setIsListening(false)
				}
			}

			recognitionRef.current = recognition
			recognition.start()
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to start speech recognition'
			setError(msg)
			onErrorRef.current?.(msg)
			setIsListening(false)
			shouldBeListeningRef.current = false
		}
	}, [cleanup, continuous, lang])

	const toggleListening = useCallback(() => {
		if (isListening) {
			stopListening()
		} else {
			startListening()
		}
	}, [isListening, startListening, stopListening])

	useEffect(() => {
		return () => {
			cleanup()
		}
	}, [cleanup])

	return {
		isSupported,
		isListening,
		interimText,
		error,
		startListening,
		stopListening,
		toggleListening,
	}
}
