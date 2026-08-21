import { useState } from 'react'
import type { ChangeStatus, ChangedFile, FileDiff } from '@shared/types/git'
import { Field, GhTextarea, GhToggle, Sheet, SheetActions } from './github/GitHubUi'
import '../styles/panels.css'

type ChangesListProps = {
	files: ChangedFile[]
	selectedPath: string | null
	onSelect: (path: string) => void
	onStage?: (path: string) => void
	onUnstage?: (path: string) => void
	onStageAll?: () => void
	onUnstageAll?: () => void
	onDiscard?: (path: string) => void
	busy?: boolean
}

const STATUS_LABELS: Record<ChangeStatus, string> = {
	modified: 'Modified',
	added: 'Added',
	deleted: 'Deleted',
	renamed: 'Renamed',
	untracked: 'New',
	conflicted: 'Conflict',
}

export function ChangesList({
	files,
	selectedPath,
	onSelect,
	onStage,
	onUnstage,
	onStageAll,
	onUnstageAll,
	onDiscard,
	busy,
}: ChangesListProps) {
	const stagedFiles = files.filter((f) => f.staged)
	const unstagedFiles = files.filter((f) => !f.staged)

	if (files.length === 0) {
		return (
			<div className="changes-list" role="list">
				<div className="empty-state">
					<p className="empty-state__text">Working tree clean</p>
					<p className="empty-state__subtext">No staged or unstaged changes</p>
				</div>
			</div>
		)
	}

	return (
		<div className="changes-list" role="list">
			{/* Staged files section */}
			{stagedFiles.length > 0 && (
				<div className="changes-section">
					<div className="changes-section__header">
						<span className="changes-section__title">
							Staged Changes ({stagedFiles.length})
						</span>
						{onUnstageAll && (
							<button
								type="button"
								className="btn btn--ghost btn--xs"
								onClick={onUnstageAll}
								disabled={busy}
								title="Unstage all files"
							>
								Unstage all
							</button>
						)}
					</div>
					{stagedFiles.map((file) => (
						<div
							key={`staged:${file.path}`}
							className="changes-list__row"
						>
							<button
								type="button"
								className={`changes-list__item${selectedPath === file.path ? ' is-selected' : ''}`}
								onClick={() => onSelect(file.path)}
								role="listitem"
							>
								<span className="changes-list__status changes-list__status--staged">
									Staged
								</span>
								<span className="changes-list__path">{file.path}</span>
							</button>
							<div className="changes-list__actions">
								{onUnstage && (
									<button
										type="button"
										className="btn btn--ghost btn--xs"
										onClick={() => onUnstage(file.path)}
										disabled={busy}
										title="Unstage this file"
									>
										Unstage
									</button>
								)}
								{onDiscard && (
									<button
										type="button"
										className="btn btn--ghost btn--xs"
										onClick={() => onDiscard(file.path)}
										disabled={busy}
										title="Discard changes"
									>
										Discard
									</button>
								)}
							</div>
						</div>
					))}
				</div>
			)}

			{/* Unstaged files section */}
			{unstagedFiles.length > 0 && (
				<div className="changes-section">
					<div className="changes-section__header">
						<span className="changes-section__title">
							Changes ({unstagedFiles.length})
						</span>
						{onStageAll && (
							<button
								type="button"
								className="btn btn--ghost btn--xs"
								onClick={onStageAll}
								disabled={busy}
								title="Stage all changes"
							>
								Stage all
							</button>
						)}
					</div>
					{unstagedFiles.map((file) => (
						<div
							key={`unstaged:${file.path}`}
							className="changes-list__row"
						>
							<button
								type="button"
								className={`changes-list__item${selectedPath === file.path ? ' is-selected' : ''}`}
								onClick={() => onSelect(file.path)}
								role="listitem"
							>
								<span className={`changes-list__status changes-list__status--${file.status}`}>
									{STATUS_LABELS[file.status]}
								</span>
								<span className="changes-list__path">{file.path}</span>
							</button>
							<div className="changes-list__actions">
								{onStage && (
									<button
										type="button"
										className="btn btn--ghost btn--xs"
										onClick={() => onStage(file.path)}
										disabled={busy}
										title="Stage this file"
									>
										Stage
									</button>
								)}
								{onDiscard && (
									<button
										type="button"
										className="btn btn--ghost btn--xs"
										onClick={() => onDiscard(file.path)}
										disabled={busy}
										title="Discard changes"
									>
										Discard
									</button>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

type DiffViewProps = {
	diff: FileDiff | null
}

export function DiffView({ diff }: DiffViewProps) {
	if (!diff) {
		return (
			<div className="empty-state">
				<p className="empty-state__text">Select a changed file to view its diff</p>
			</div>
		)
	}

	return (
		<div className="diff-view">
			<div className="diff-view__header">
				<span className="diff-view__path">{diff.path}</span>
			</div>
			{diff.hunks.length === 0 ? (
				<div className="empty-state">
					<p className="empty-state__text">No diff available</p>
				</div>
			) : (
				diff.hunks.map((hunk, index) => (
					<div key={index} className="diff-hunk">
						<div className="diff-hunk__header">{hunk.header}</div>
						{hunk.lines.map((line, lineIndex) => (
							<div
								key={lineIndex}
								className={`diff-line diff-line--${line.type === 'context' ? 'context' : line.type}`}
							>
								<span className="diff-line__num">{line.oldLineNumber ?? ''}</span>
								<span className="diff-line__num">{line.newLineNumber ?? ''}</span>
								<span className="diff-line__content">{line.content}</span>
							</div>
						))}
					</div>
				))
			)}
		</div>
	)
}

type CommitSheetProps = {
	open: boolean
	stagedCount: number
	unstagedCount: number
	onClose: () => void
	onCommit: (message: string, stageAllFirst: boolean) => Promise<void>
	busy?: boolean
	error?: string | null
}

export function CommitSheet({
	open,
	stagedCount,
	unstagedCount,
	onClose,
	onCommit,
	busy,
	error,
}: CommitSheetProps) {
	const [message, setMessage] = useState('')
	const [stageAll, setStageAll] = useState(stagedCount === 0 && unstagedCount > 0)

	const handleSubmit = () => {
		const trimmed = message.trim()
		if (!trimmed || busy) return
		void onCommit(trimmed, stageAll).then(() => {
			setMessage('')
		})
	}

	return (
		<Sheet open={open} title="Commit Changes" onClose={onClose}>
			{error && <div className="panel-alert panel-alert--error">{error}</div>}

			<div className="commit-sheet__summary">
				{stagedCount > 0 ? (
					<div className="commit-sheet__badge commit-sheet__badge--staged">
						{stagedCount} file{stagedCount === 1 ? '' : 's'} staged
					</div>
				) : (
					<div className="commit-sheet__badge commit-sheet__badge--warn">
						No files staged
					</div>
				)}
				{unstagedCount > 0 && (
					<div className="commit-sheet__badge">
						{unstagedCount} unstaged change{unstagedCount === 1 ? '' : 's'}
					</div>
				)}
			</div>

			{unstagedCount > 0 && (
				<GhToggle
					checked={stageAll}
					onChange={setStageAll}
					label={
						stagedCount === 0
							? `Stage all ${unstagedCount} file(s) before commit`
							: `Include all remaining ${unstagedCount} unstaged file(s)`
					}
				/>
			)}

			<Field label="Commit message" hint="Press Ctrl+Enter to commit">
				<GhTextarea
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					onKeyDown={(e) => {
						if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
							e.preventDefault()
							handleSubmit()
						}
					}}
					rows={4}
					placeholder="Describe what changed..."
					autoFocus
				/>
			</Field>

			<SheetActions>
				<button
					type="button"
					className="btn btn--ghost"
					onClick={onClose}
					disabled={busy}
				>
					Cancel
				</button>
				<button
					type="button"
					className="btn btn--primary"
					disabled={!message.trim() || busy || (stagedCount === 0 && !stageAll)}
					onClick={handleSubmit}
				>
					{busy
						? 'Committing…'
						: stageAll && stagedCount === 0
							? 'Stage All & Commit'
							: 'Commit'}
				</button>
			</SheetActions>
		</Sheet>
	)
}
