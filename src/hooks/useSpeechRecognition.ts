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

/** Join transcript parts without repeating overlapping words at the boundary. */
export function mergeTranscriptParts(committed: string, extension: string): string {
	const left = committed.trim()
	const right = extension.trim()
	if (!left) return right
	if (!right) return left
	if (left === right) return left
	if (left.endsWith(right)) return left
	if (right.startsWith(left)) return right

	const leftWords = left.split(/\s+/).filter(Boolean)
	const rightWords = right.split(/\s+/).filter(Boolean)
	const maxOverlap = Math.min(leftWords.length, rightWords.length)

	for (let overlap = maxOverlap; overlap > 0; overlap--) {
		const suffix = leftWords.slice(-overlap).join(' ')
		const prefix = rightWords.slice(0, overlap).join(' ')
		if (suffix === prefix) {
			return [...leftWords, ...rightWords.slice(overlap)].join(' ')
		}
	}

	return `${left} ${right}`
}

export function composeSessionTranscript(
	cumulative: string,
	subsessionCommitted: string,
	interim: string,
): string {
	let session = cumulative.trim()
	const committed = subsessionCommitted.trim()
	const pending = interim.trim()

	if (committed) {
		session = mergeTranscriptParts(session, committed)
	}
	if (pending) {
		session = mergeTranscriptParts(session, pending)
	}

	return session.replace(/\s+/g, ' ').trim()
}

export type UseSpeechRecognitionOptions = {
	onTranscript?: (fullTranscript: string) => void
	onResult?: (finalText: string) => void
	onInterim?: (interimText: string) => void
	onError?: (errorMessage: string) => void
	lang?: string
	continuous?: boolean
}

export function useSpeechRecognition({
	onTranscript,
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

	const cumulativeTranscriptRef = useRef('')
	const subsessionCommittedRef = useRef('')
	const currentInterimRef = useRef('')

	const isSupported = typeof window !== 'undefined' && Boolean(getSpeechRecognitionConstructor())

	const onTranscriptRef = useRef(onTranscript)
	onTranscriptRef.current = onTranscript
	const onResultRef = useRef(onResult)
	onResultRef.current = onResult
	const onInterimRef = useRef(onInterim)
	onInterimRef.current = onInterim
	const onErrorRef = useRef(onError)
	onErrorRef.current = onError

	const emitTranscript = useCallback((text: string) => {
		const trimmed = text.trim()
		if (!trimmed) return
		onTranscriptRef.current?.(trimmed)
		onResultRef.current?.(trimmed)
	}, [])

	const emitCurrentSession = useCallback(() => {
		const fullTranscript = composeSessionTranscript(
			cumulativeTranscriptRef.current,
			subsessionCommittedRef.current,
			currentInterimRef.current,
		)
		emitTranscript(fullTranscript)
	}, [emitTranscript])

	const commitSubsessionToCumulative = useCallback(() => {
		const committed = subsessionCommittedRef.current.trim()
		const pending = currentInterimRef.current.trim()
		let toCommit = committed

		if (pending) {
			toCommit = mergeTranscriptParts(toCommit, pending)
		}

		if (toCommit) {
			cumulativeTranscriptRef.current = mergeTranscriptParts(
				cumulativeTranscriptRef.current,
				toCommit,
			)
		}

		subsessionCommittedRef.current = ''
		currentInterimRef.current = ''
	}, [])

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
		subsessionCommittedRef.current = ''
		currentInterimRef.current = ''
	}, [])

	const initRecognition = useCallback(() => {
		const Constructor = getSpeechRecognitionConstructor()
		if (!Constructor) {
			const msg = 'Speech recognition is not supported in this browser.'
			setError(msg)
			onErrorRef.current?.(msg)
			setIsListening(false)
			shouldBeListeningRef.current = false
			return null
		}

		try {
			const recognition = new Constructor()
			recognition.continuous = continuous
			recognition.interimResults = true
			recognition.lang =
				lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US'

			subsessionCommittedRef.current = ''
			currentInterimRef.current = ''

			recognition.onstart = () => {
				setIsListening(true)
			}

			recognition.onresult = (event: SpeechRecognitionEvent) => {
				let incrementalFinal = ''
				let latestInterim = ''

				for (let i = event.resultIndex; i < event.results.length; i++) {
					const res = event.results[i]
					const text = res[0]?.transcript?.trim() || ''
					if (!text) continue

					if (res.isFinal) {
						incrementalFinal = incrementalFinal
							? mergeTranscriptParts(incrementalFinal, text)
							: text
					} else {
						latestInterim = text
					}
				}

				if (incrementalFinal) {
					subsessionCommittedRef.current = mergeTranscriptParts(
						subsessionCommittedRef.current,
						incrementalFinal,
					)
				}

				currentInterimRef.current = latestInterim
				emitCurrentSession()
				setInterimText(latestInterim)
				onInterimRef.current?.(latestInterim)
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
				commitSubsessionToCumulative()
				setInterimText('')

				if (shouldBeListeningRef.current) {
					restartTimeoutRef.current = window.setTimeout(() => {
						if (shouldBeListeningRef.current) {
							const nextRec = initRecognition()
							if (nextRec) {
								recognitionRef.current = nextRec
								try {
									nextRec.start()
								} catch {
									setIsListening(false)
									shouldBeListeningRef.current = false
								}
							}
						}
					}, 150)
				} else {
					setIsListening(false)
				}
			}

			return recognition
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to initialize speech recognition'
			setError(msg)
			onErrorRef.current?.(msg)
			setIsListening(false)
			shouldBeListeningRef.current = false
			return null
		}
	}, [commitSubsessionToCumulative, continuous, emitCurrentSession, lang])

	const stopListening = useCallback(() => {
		shouldBeListeningRef.current = false
		if (restartTimeoutRef.current) {
			window.clearTimeout(restartTimeoutRef.current)
			restartTimeoutRef.current = null
		}

		emitCurrentSession()

		if (recognitionRef.current) {
			try {
				recognitionRef.current.stop()
			} catch {
				// ignore stop error
			}
		} else {
			commitSubsessionToCumulative()
			setInterimText('')
			setIsListening(false)
		}
	}, [commitSubsessionToCumulative, emitCurrentSession])

	const startListening = useCallback(() => {
		cleanup()
		setError(null)
		setInterimText('')
		cumulativeTranscriptRef.current = ''
		subsessionCommittedRef.current = ''
		currentInterimRef.current = ''
		shouldBeListeningRef.current = true

		const recognition = initRecognition()
		if (!recognition) return

		recognitionRef.current = recognition
		try {
			recognition.start()
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to start speech recognition'
			setError(msg)
			onErrorRef.current?.(msg)
			setIsListening(false)
			shouldBeListeningRef.current = false
		}
	}, [cleanup, initRecognition])

	const toggleListening = useCallback(() => {
		if (isListening) {
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
