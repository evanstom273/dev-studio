import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ClipboardEvent } from 'react'
import type { AgentMode, AgentModelDefinition, AttachmentInfo } from '@shared/types/agent'
import { AGENT_MODES } from '../types/index'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import {
	IconCheck,
	IconClose,
	IconCode,
	IconDocument,
	IconImage,
	IconMic,
	IconPlus,
	IconSend,
	IconSparkles,
	IconStop,
} from './Icons'
import {
	IMPLEMENT_WITH_SUBAGENTS_HIDDEN_PROMPT,
	PARALLELIZE_WITH_SUBAGENTS_PROMPT,
	RESEARCH_SUBAGENT_PROMPT,
} from '../constants/codexSubagentPrompts'
import '../styles/agent.css'

export type PromptComposerSendOptions = {
	hiddenPrefix?: string
}

export type PromptComposerProps = {
	value: string
	onChange: (value: string) => void
	onSend: (options?: PromptComposerSendOptions) => void
	onStop?: () => void
	loading?: boolean
	mode: AgentMode
	onModeChange: (mode: AgentMode) => void
	model?: string
	availableModels?: string[]
	modelDefinitions?: AgentModelDefinition[]
	onModelChange?: (model: string) => void
	reasoningEffort?: string
	onReasoningEffortChange?: (effort: string) => void
	speed?: string
	onSpeedChange?: (speed: string) => void
	attachments: AttachmentInfo[]
	onAddAttachments: (files: FileList | File[]) => void
	onRemoveAttachment: (id: string) => void
	keyboardOpen?: boolean
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getAttachmentIcon(contentType: string, name: string) {
	if (contentType.startsWith('image/')) return IconImage
	if (
		name.endsWith('.ts') ||
		name.endsWith('.tsx') ||
		name.endsWith('.js') ||
		name.endsWith('.jsx') ||
		name.endsWith('.py') ||
		name.endsWith('.json') ||
		name.endsWith('.html') ||
		name.endsWith('.css') ||
		name.endsWith('.go') ||
		name.endsWith('.rs') ||
		name.endsWith('.java') ||
		name.endsWith('.c') ||
		name.endsWith('.cpp')
	) {
		return IconCode
	}
	return IconDocument
}

export function PromptComposer({
	value,
	onChange,
	onSend,
	onStop,
	loading = false,
	mode,
	onModeChange,
	model,
	availableModels = [],
	modelDefinitions = [],
	onModelChange,
	reasoningEffort,
	onReasoningEffortChange,
	speed,
	onSpeedChange,
	attachments,
	onAddAttachments,
	onRemoveAttachment,
	keyboardOpen = false,
}: PromptComposerProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [modelMenuOpen, setModelMenuOpen] = useState(false)
	const [menuTab, setMenuTab] = useState<'model' | 'effort' | 'speed'>('model')
	const modelMenuRef = useRef<HTMLDivElement>(null)
	const [speechError, setSpeechError] = useState<string | null>(null)
	const [armedHiddenPrefix, setArmedHiddenPrefix] = useState<string | null>(null)

	const valueRef = useRef(value)
	valueRef.current = value
	const initialValueRef = useRef('')

	const handleTranscript = useCallback(
		(sessionTranscript: string) => {
			const base = initialValueRef.current
			const transcript = sessionTranscript.trim()
			let combined: string
			if (!base) {
				combined = transcript
			} else if (!transcript) {
				combined = base
			} else {
				const needsSpace = !base.endsWith(' ') && !base.endsWith('\n')
				combined = `${base}${needsSpace ? ' ' : ''}${transcript}`
			}
			valueRef.current = combined
			onChange(combined)
		},
		[onChange],
	)

	const {
		isSupported: isSpeechSupported,
		isListening,
		interimText,
		startListening,
		stopListening,
	} = useSpeechRecognition({
		onTranscript: handleTranscript,
		onError: (err) => {
			setSpeechError(err)
			setTimeout(() => {
				setSpeechError((prev) => (prev === err ? null : prev))
			}, 5000)
		},
	})

	const handleToggleListening = useCallback(() => {
		if (isListening) {
			stopListening()
		} else {
			initialValueRef.current = valueRef.current
			startListening()
		}
	}, [isListening, startListening, stopListening])

	useEffect(() => {
		const textarea = textareaRef.current
		if (!textarea) return
		textarea.style.height = 'auto'
		textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
	}, [value, interimText])

	useEffect(() => {
		if (keyboardOpen) {
			setModelMenuOpen(false)
		}
	}, [keyboardOpen])

	// Close model menu when clicking outside
	useEffect(() => {
		if (!modelMenuOpen) return
		const handlePointerDown = (e: PointerEvent) => {
			if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
				setModelMenuOpen(false)
			}
		}
		window.addEventListener('pointerdown', handlePointerDown)
		return () => window.removeEventListener('pointerdown', handlePointerDown)
	}, [modelMenuOpen])

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault()
		if (isListening) {
			stopListening()
		}
		if (loading) {
			onStop?.()
			return
		}
		if (valueRef.current.trim() || attachments.length > 0) {
			onSend(armedHiddenPrefix ? { hiddenPrefix: armedHiddenPrefix } : undefined)
			setArmedHiddenPrefix(null)
		}
	}

	const appendVisiblePrompt = (instruction: string) => {
		setArmedHiddenPrefix(null)
		onChange(
			value.trim() ? `${value.trim()}\n\n${instruction}` : instruction,
		)
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			if (isListening) {
				stopListening()
			}
			if (valueRef.current.trim() || attachments.length > 0) {
				onSend(armedHiddenPrefix ? { hiddenPrefix: armedHiddenPrefix } : undefined)
				setArmedHiddenPrefix(null)
			}
		}
	}

	const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		if (event.clipboardData.files && event.clipboardData.files.length > 0) {
			onAddAttachments(event.clipboardData.files)
		}
	}

	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		if (event.target.files && event.target.files.length > 0) {
			onAddAttachments(event.target.files)
			event.target.value = ''
		}
	}

	const canSend = Boolean(value.trim() || attachments.length > 0)
	const matchingDef = modelDefinitions.find((d) => d.id === model) || modelDefinitions.find((d) => !model && d.isDefault)
	const isCodexModel = matchingDef?.providerId === 'codex' || (model && (model.startsWith('gpt-') || model.startsWith('codex:') || model.startsWith('o1') || model.startsWith('o3')))

	const currentEffort = reasoningEffort || matchingDef?.defaultReasoningEffort || 'medium'
	const currentSpeed = speed || matchingDef?.defaultSpeedTier || 'default'

	const activeEffortOption = matchingDef?.supportedReasoningEfforts?.find((e) => e.effort === currentEffort)
	const effortLabel = activeEffortOption ? activeEffortOption.label : currentEffort.charAt(0).toUpperCase() + currentEffort.slice(1)
	const activeSpeedOption = matchingDef?.supportedSpeedTiers?.find((s) => s.tier === currentSpeed)
	const speedLabel = activeSpeedOption ? activeSpeedOption.label : currentSpeed === 'fast' ? 'Fast' : 'Standard'

	const activeModelLabel = matchingDef
		? isCodexModel
			? `${matchingDef.name} ${effortLabel}`
			: matchingDef.name
		: model
			? model.replace(/^gemini-/, 'Gemini ').replace(/^claude-/, 'Claude ').replace(/^gpt-/, 'GPT ')
			: 'Default Model'

	return (
		<form
			className={`composer${keyboardOpen ? ' composer--keyboard-open' : ''}`}
			onSubmit={handleSubmit}
		>
			<div className="composer__box">
				{/* Hidden Native File Input */}
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="composer__file-input sr-only"
					style={{ display: 'none' }}
					tabIndex={-1}
					aria-hidden="true"
					onChange={handleFileSelect}
					accept="image/*,.pdf,.txt,.md,.json,.ts,.tsx,.js,.jsx,.py,.html,.css,.yaml,.yml,.toml,.rs,.go,.java,.c,.cpp,.h"
				/>

				{/* Primary Prompt Textarea */}
				<textarea
					ref={textareaRef}
					className="composer__input"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					onFocus={() => {
						requestAnimationFrame(() => {
							textareaRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
						})
					}}
					placeholder={
						mode === 'ask'
							? 'Ask a question about the code...'
							: mode === 'plan'
							? 'Describe what to plan...'
							: isCodexModel
							? 'Ask Dev Studio, or use subagents for parallel work…'
							: 'Add a follow up or ask Dev Studio...'
					}
					rows={1}
					aria-label="Prompt input"
				/>

				{isCodexModel && mode === 'agent' && !loading && (
					<div className="composer__quick-prompts" aria-label="Codex subagent shortcuts">
						{armedHiddenPrefix && (
							<span className="composer__quick-prompt-armed" role="status">
								Parallel implementation armed
								<button
									type="button"
									className="composer__quick-prompt-armed-clear"
									onClick={() => setArmedHiddenPrefix(null)}
									aria-label="Clear parallel implementation mode"
								>
									×
								</button>
							</span>
						)}
						<button
							type="button"
							className={`composer__quick-prompt${armedHiddenPrefix ? ' is-active' : ''}`}
							onClick={() => setArmedHiddenPrefix(IMPLEMENT_WITH_SUBAGENTS_HIDDEN_PROMPT)}
							disabled={loading}
							title="Split into independent workstreams with clear ownership, integrate, then build and test"
						>
							Implement with subagents
						</button>
						<button
							type="button"
							className="composer__quick-prompt"
							onClick={() => appendVisiblePrompt(PARALLELIZE_WITH_SUBAGENTS_PROMPT)}
							disabled={loading}
						>
							Parallelize with subagents
						</button>
						<button
							type="button"
							className="composer__quick-prompt"
							onClick={() => appendVisiblePrompt(RESEARCH_SUBAGENT_PROMPT)}
							disabled={loading}
						>
							Research subagent
						</button>
					</div>
				)}

				{/* Attachments Preview Row */}
				{attachments.length > 0 && (
					<div className="composer__attachments" aria-label="Attachments">
						{attachments.map((att) => {
							const Icon = getAttachmentIcon(att.contentType, att.name)
							return (
								<div key={att.id} className="attachment-chip">
									{att.previewUrl ? (
										<img
											src={att.previewUrl}
											alt={att.name}
											className="attachment-chip__thumb"
										/>
									) : (
										<div className="attachment-chip__icon-wrap">
											<Icon className="attachment-chip__icon" />
										</div>
									)}
									<div className="attachment-chip__details">
										<span className="attachment-chip__name" title={att.name}>
											{att.name}
										</span>
										<span className="attachment-chip__size">
											{formatFileSize(att.size)}
										</span>
									</div>
									<button
										type="button"
										className="attachment-chip__remove"
										onClick={() => onRemoveAttachment(att.id)}
										aria-label={`Remove ${att.name}`}
										title="Remove attachment"
										disabled={loading}
									>
										<IconClose className="attachment-chip__close-icon" />
									</button>
								</div>
							)
						})}
					</div>
				)}

				{/* Speech Recognition Live Status Bar */}
				{isListening && (
					<div className="composer__listening-bar" aria-live="polite">
						<div className="composer__listening-left">
							<span className="composer__listening-pulse" />
							<span className="composer__listening-text">
								{interimText ? `"${interimText}"` : 'Listening… speak now'}
							</span>
						</div>
						<button
							type="button"
							className="composer__listening-done"
							onClick={stopListening}
							title="Stop dictating"
						>
							Done
						</button>
					</div>
				)}

				{/* Speech Error Banner */}
				{speechError && (
					<div className="composer__speech-error" role="alert">
						<span>{speechError}</span>
						<button
							type="button"
							className="composer__speech-error-close"
							onClick={() => setSpeechError(null)}
							aria-label="Dismiss speech error"
						>
							×
						</button>
					</div>
				)}

				{/* Bottom Action Bar inside Container */}
				<div className="composer__bottom-bar">
					<div className="composer__left-actions">
						{/* '+' Context / Add Attachment Button */}
						<button
							type="button"
							className="composer__add-btn"
							onClick={() => fileInputRef.current?.click()}
							disabled={loading}
							aria-label="Add files or images"
							title="Add context / attachments"
						>
							<IconPlus className="composer__add-icon" />
						</button>

						{/* STT / Speech Dictation Button */}
						<button
							type="button"
							className={`composer__mic-btn${isListening ? ' is-listening' : ''}${!isSpeechSupported ? ' is-unsupported' : ''}`}
							onClick={handleToggleListening}
							disabled={loading}
							aria-label={isListening ? 'Stop dictation' : 'Dictate with voice'}
							title={
								!isSpeechSupported
									? 'Speech recognition is not supported in this browser'
									: isListening
									? 'Listening… tap to stop'
									: 'Dictate prompt with voice'
							}
						>
							<IconMic className="composer__mic-icon" />
						</button>

						{/* Mode Toggle Buttons */}
						<div className="composer__modes" role="radiogroup" aria-label="Agent mode">
							{AGENT_MODES.map((m) => (
								<button
									key={m.id}
									type="button"
									role="radio"
									aria-checked={mode === m.id}
									className={`composer__mode-btn composer__mode-btn--${m.id}${mode === m.id ? ' is-active' : ''}`}
									onClick={() => onModeChange(m.id)}
									disabled={loading}
									title={m.description}
								>
									{m.label}
								</button>
							))}
						</div>

						{/* Model Selector Popover */}
						<div className="composer__model-wrapper" ref={modelMenuRef}>
							<button
								type="button"
								className={`composer__model-btn${modelMenuOpen ? ' is-open' : ''}`}
								onClick={() => setModelMenuOpen((prev) => !prev)}
								disabled={loading}
								aria-haspopup="menu"
								aria-expanded={modelMenuOpen}
								title={`Model: ${model || 'Default'}`}
							>
								<IconSparkles className="composer__model-icon" />
								<span className="composer__model-label">{activeModelLabel}</span>
								<span className="composer__model-arrow">▾</span>
							</button>

							{modelMenuOpen && (
								<div className="composer__model-menu" role="menu">
									{isCodexModel && (
										<div className="composer__model-tabs" role="tablist">
											<button
												type="button"
												role="tab"
												aria-selected={menuTab === 'model'}
												className={`composer__model-tab${menuTab === 'model' ? ' is-active' : ''}`}
												onClick={() => setMenuTab('model')}
											>
												Model
											</button>
											<button
												type="button"
												role="tab"
												aria-selected={menuTab === 'effort'}
												className={`composer__model-tab${menuTab === 'effort' ? ' is-active' : ''}`}
												onClick={() => setMenuTab('effort')}
											>
												Effort: {effortLabel}
											</button>
											<button
												type="button"
												role="tab"
												aria-selected={menuTab === 'speed'}
												className={`composer__model-tab${menuTab === 'speed' ? ' is-active' : ''}`}
												onClick={() => setMenuTab('speed')}
											>
												Speed: {speedLabel}
											</button>
										</div>
									)}

									{menuTab === 'effort' && isCodexModel ? (
										<>
											<div className="composer__model-menu-header">Reasoning Effort</div>
											{(matchingDef?.supportedReasoningEfforts || [
												{ effort: 'low', label: 'Light', description: 'Fast responses with lighter reasoning' },
												{ effort: 'medium', label: 'Medium', description: 'Balances speed and reasoning depth for everyday tasks' },
												{ effort: 'high', label: 'High', description: 'Greater reasoning depth for complex problems' },
												{ effort: 'xhigh', label: 'Extra High', description: 'Extra high reasoning depth for complex problems' },
											]).map((eff) => {
												const isSelected = currentEffort === eff.effort
												return (
													<button
														key={eff.effort}
														type="button"
														className={`composer__model-item${isSelected ? ' is-active' : ''}`}
														role="menuitem"
														onClick={() => {
															onReasoningEffortChange?.(eff.effort)
														}}
													>
														<div className="composer__model-item-content">
															<span className="composer__model-name" style={{ fontWeight: 600 }}>{eff.label}</span>
															{eff.description && (
																<span className="composer__model-item-desc">{eff.description}</span>
															)}
														</div>
														{isSelected && <IconCheck className="composer__model-check" />}
													</button>
												)
											})}
										</>
									) : menuTab === 'speed' && isCodexModel ? (
										<>
											<div className="composer__model-menu-header">Speed Tier</div>
											{(matchingDef?.supportedSpeedTiers || [
												{ tier: 'default', label: 'Standard', description: 'Default speed' },
												{ tier: 'fast', label: 'Fast', description: '1.5x speed, more usage' },
											]).map((sp) => {
												const isSelected = currentSpeed === sp.tier
												return (
													<button
														key={sp.tier}
														type="button"
														className={`composer__model-item${isSelected ? ' is-active' : ''}`}
														role="menuitem"
														onClick={() => {
															onSpeedChange?.(sp.tier)
														}}
													>
														<div className="composer__model-item-content">
															<span className="composer__model-name" style={{ fontWeight: 600 }}>{sp.label}</span>
															{sp.description && (
																<span className="composer__model-item-desc">{sp.description}</span>
															)}
														</div>
														{isSelected && <IconCheck className="composer__model-check" />}
													</button>
												)
											})}
										</>
									) : (
										<>
											<div className="composer__model-menu-header">Select Model</div>
											{modelDefinitions.length > 0 ? (
												<>
													{modelDefinitions.some((d) => d.providerId === 'codex') && (
														<>
															<div className="composer__model-group-title">OpenAI Codex (ChatGPT)</div>
															{modelDefinitions
																.filter((d) => d.providerId === 'codex')
																.map((m) => {
																	const isSelected = model === m.id || (!model && m.isDefault)
																	return (
																		<button
																			key={m.id}
																			type="button"
																			className={`composer__model-item${isSelected ? ' is-active' : ''}`}
																			role="menuitem"
																			onClick={() => {
																				onModelChange?.(m.id)
																				if (m.defaultReasoningEffort) {
																					onReasoningEffortChange?.(m.defaultReasoningEffort)
																				}
																				if (m.defaultSpeedTier) {
																					onSpeedChange?.(m.defaultSpeedTier)
																				}
																			}}
																		>
																			<div className="composer__model-item-content">
																				<div className="composer__model-item-title">
																					<span className="composer__model-name">{m.name}</span>
																					<span className="composer__model-provider-badge">Codex</span>
																				</div>
																				{m.description && (
																					<span className="composer__model-item-desc">{m.description}</span>
																				)}
																			</div>
																			{isSelected && <IconCheck className="composer__model-check" />}
																		</button>
																	)
																})}
														</>
													)}
													{modelDefinitions.some((d) => d.providerId === 'antigravity') && (
														<>
															<div className="composer__model-group-title">Google Antigravity</div>
															{modelDefinitions
																.filter((d) => d.providerId === 'antigravity')
																.map((m) => {
																	const isSelected = model === m.id || (!model && m.isDefault)
																	return (
																		<button
																			key={m.id}
																			type="button"
																			className={`composer__model-item${isSelected ? ' is-active' : ''}`}
																			role="menuitem"
																			onClick={() => {
																				onModelChange?.(m.id)
																				setMenuTab('model')
																				setModelMenuOpen(false)
																			}}
																		>
																			<span className="composer__model-name">{m.name}</span>
																			{isSelected && <IconCheck className="composer__model-check" />}
																		</button>
																	)
																})}
														</>
													)}
												</>
											) : availableModels.length === 0 ? (
												<div className="composer__model-item is-active" role="menuitem">
													<span>Default (CLI configured)</span>
													<IconCheck className="composer__model-check" />
												</div>
											) : (
												availableModels.map((m) => {
													const isSelected = model === m || (!model && m.includes('2.5'))
													return (
														<button
															key={m}
															type="button"
															className={`composer__model-item${isSelected ? ' is-active' : ''}`}
															role="menuitem"
															onClick={() => {
																onModelChange?.(m)
																setModelMenuOpen(false)
															}}
														>
															<span className="composer__model-name">{m}</span>
															{isSelected && <IconCheck className="composer__model-check" />}
														</button>
													)
												})
											)}
										</>
									)}

									{isCodexModel && (
										<button
											type="button"
											className="composer__model-reset-btn"
											onClick={() => {
												const defaultModelDef = modelDefinitions.find((d) => d.providerId === 'codex' && d.isDefault)
												if (defaultModelDef) {
													onModelChange?.(defaultModelDef.id)
													if (defaultModelDef.defaultReasoningEffort) {
														onReasoningEffortChange?.(defaultModelDef.defaultReasoningEffort)
													}
													if (defaultModelDef.defaultSpeedTier) {
														onSpeedChange?.(defaultModelDef.defaultSpeedTier)
													}
												}
												setMenuTab('model')
											}}
										>
											<span>↺ Reset to default</span>
										</button>
									)}
								</div>
							)}
						</div>
					</div>

					{/* Adaptive Send / Stop Button */}
					{loading ? (
						<button
							type="button"
							className="composer__send composer__send--stop"
							onClick={onStop}
							aria-label="Stop generation"
							title="Stop generation"
						>
							<IconStop className="composer__action-icon" />
						</button>
					) : (
						<button
							type="submit"
							className="composer__send"
							disabled={!canSend}
							aria-label="Send message"
							title="Send message"
						>
							<IconSend className="composer__action-icon" />
						</button>
					)}
				</div>
			</div>
		</form>
	)
}
