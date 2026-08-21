import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ClipboardEvent } from 'react'
import type { AgentMode, AttachmentInfo } from '@shared/types/agent'
import { AGENT_MODES } from '../types/index'
import {
	IconCheck,
	IconClose,
	IconCode,
	IconDocument,
	IconImage,
	IconPlus,
	IconSend,
	IconSparkles,
	IconStop,
} from './Icons'
import '../styles/agent.css'

export type PromptComposerProps = {
	value: string
	onChange: (value: string) => void
	onSend: () => void
	onStop?: () => void
	loading?: boolean
	mode: AgentMode
	onModeChange: (mode: AgentMode) => void
	model?: string
	availableModels?: string[]
	onModelChange?: (model: string) => void
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
	onModelChange,
	attachments,
	onAddAttachments,
	onRemoveAttachment,
	keyboardOpen = false,
}: PromptComposerProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [modelMenuOpen, setModelMenuOpen] = useState(false)
	const modelMenuRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const textarea = textareaRef.current
		if (!textarea) return
		textarea.style.height = 'auto'
		textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
	}, [value])

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
		if (loading) {
			onStop?.()
			return
		}
		if (value.trim() || attachments.length > 0) {
			onSend()
		}
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			if (value.trim() || attachments.length > 0) {
				onSend()
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
	const activeModelLabel = model
		? model.replace(/^gemini-/, '').replace(/^claude-/, '')
		: 'Default Model'

	return (
		<form
			className={`composer${keyboardOpen ? ' composer--keyboard-open' : ''}`}
			onSubmit={handleSubmit}
		>
			{/* Compact Composer Controls: Mode & Model Pickers */}
			<div className="composer__meta-row">
				<div className="composer__modes" role="radiogroup" aria-label="Agent mode">
					{AGENT_MODES.map((m) => (
						<button
							key={m.id}
							type="button"
							role="radio"
							aria-checked={mode === m.id}
							className={`composer__mode-btn${mode === m.id ? ' is-active' : ''}`}
							onClick={() => onModeChange(m.id)}
							disabled={loading}
							title={m.description}
						>
							{m.label}
						</button>
					))}
				</div>

				{/* Model Selector Trigger & Popover */}
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
					</button>

					{modelMenuOpen && (
						<div className="composer__model-menu" role="menu">
							<div className="composer__model-menu-header">Select Model</div>
							{availableModels.length === 0 ? (
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
						</div>
					)}
				</div>
			</div>

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

			{/* Main Input Row */}
			<div className="composer__row">
				{/* Hidden Native File Input */}
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="composer__file-input"
					tabIndex={-1}
					aria-hidden="true"
					onChange={handleFileSelect}
					accept="image/*,.pdf,.txt,.md,.json,.ts,.tsx,.js,.jsx,.py,.html,.css,.yaml,.yml,.toml,.rs,.go,.java,.c,.cpp,.h"
				/>

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

				<textarea
					ref={textareaRef}
					className="composer__input"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					placeholder={
						mode === 'ask'
							? 'Ask a question about the code...'
							: mode === 'plan'
							? 'Describe what to plan...'
							: 'Describe a coding task or bug to fix...'
					}
					rows={1}
					aria-label="Prompt input"
				/>

				{/* Adaptive Send / Stop Button */}
				{loading ? (
					<button
						type="button"
						className="composer__send composer__send--stop"
						onClick={onStop}
						aria-label="Stop generation"
						title="Stop generation"
					>
						<IconStop className="bottom-nav__icon" />
					</button>
				) : (
					<button
						type="submit"
						className="composer__send"
						disabled={!canSend}
						aria-label="Send message"
						title="Send message"
					>
						<IconSend className="bottom-nav__icon" />
					</button>
				)}
			</div>
		</form>
	)
}
