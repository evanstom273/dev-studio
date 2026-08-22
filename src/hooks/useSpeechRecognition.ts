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
	onStart?: () => void
	lang?: string
	continuous?: boolean
}

export function useSpeechRecognition({
	onResult,
	onInterim,
	onError,
	onStart,
	lang,
	continuous = true,
}: UseSpeechRecognitionOptions = {}) {
	const [isListening, setIsListening] = useState(false)
	const [interimText, setInterimText] = useState('')
	const [error, setError] = useState<string | null>(null)
	const recognitionRef = useRef<ISpeechRecognition | null>(null)
	const shouldBeListeningRef = useRef(false)
	const restartTimeoutRef = useRef<number | null>(null)
	const processedResultsRef = useRef(0)

	const isSupported = typeof window !== 'undefined' && Boolean(getSpeechRecognitionConstructor())

	const onResultRef = useRef(onResult)
	onResultRef.current = onResult
	const onInterimRef = useRef(onInterim)
	onInterimRef.current = onInterim
	const onErrorRef = useRef(onError)
	onErrorRef.current = onError
	const onStartRef = useRef(onStart)
	onStartRef.current = onStart

	const clearRestartTimeout = useCallback(() => {
		if (restartTimeoutRef.current) {
			window.clearTimeout(restartTimeoutRef.current)
			restartTimeoutRef.current = null
		}
	}, [])

	const disposeRecognition = useCallback(() => {
		if (!recognitionRef.current) return
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
	}, [])

	const cleanup = useCallback(() => {
		clearRestartTimeout()
		disposeRecognition()
		processedResultsRef.current = 0
		setIsListening(false)
		setInterimText('')
	}, [clearRestartTimeout, disposeRecognition])

	const stopListening = useCallback(() => {
		shouldBeListeningRef.current = false
		clearRestartTimeout()
		if (recognitionRef.current) {
			try {
				recognitionRef.current.stop()
			} catch {
				// ignore stop error
			}
		}
		disposeRecognition()
		processedResultsRef.current = 0
		setIsListening(false)
		setInterimText('')
	}, [clearRestartTimeout, disposeRecognition])

	const launchRecognition = useCallback(() => {
		const Constructor = getSpeechRecognitionConstructor()
		if (!Constructor) {
			const msg = 'Speech recognition is not supported in this browser.'
			setError(msg)
			onErrorRef.current?.(msg)
			return
		}

		disposeRecognition()
		processedResultsRef.current = 0

		try {
			const recognition = new Constructor()
			recognition.continuous = continuous
			recognition.interimResults = true
			recognition.lang =
				lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US'

			recognition.onstart = () => {
				setIsListening(true)
				onStartRef.current?.()
			}

			recognition.onresult = (event: SpeechRecognitionEvent) => {
				let finalChunk = ''
				let currentInterim = ''
				const startAt = Math.max(event.resultIndex, processedResultsRef.current)

				for (let i = startAt; i < event.results.length; i++) {
					const res = event.results[i]
					const text = res[0]?.transcript || ''
					if (res.isFinal) {
						finalChunk += text
						processedResultsRef.current = i + 1
					} else {
						currentInterim += text
					}
				}

				const trimmedFinal = finalChunk.trim()
				if (trimmedFinal) {
					onResultRef.current?.(trimmedFinal)
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
				disposeRecognition()

				if (shouldBeListeningRef.current) {
					restartTimeoutRef.current = window.setTimeout(() => {
						if (shouldBeListeningRef.current) {
							launchRecognition()
						}
					}, 250)
					return
				}

				setIsListening(false)
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
	}, [continuous, disposeRecognition, lang])

	const startListening = useCallback(() => {
		if (!getSpeechRecognitionConstructor()) {
			const msg = 'Speech recognition is not supported in this browser.'
			setError(msg)
			onErrorRef.current?.(msg)
			return
		}

		clearRestartTimeout()
		disposeRecognition()
		setError(null)
		setInterimText('')
		processedResultsRef.current = 0
		shouldBeListeningRef.current = true
		launchRecognition()
	}, [clearRestartTimeout, disposeRecognition, launchRecognition])

	const toggleListening = useCallback(() => {
		if (isListening || shouldBeListeningRef.current) {
			stopListening()
		} else {
			startListening()
		}
	}, [isListening, startListening, stopListening])

	useEffect(() => {
		return () => {
			shouldBeListeningRef.current = false
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
