import { useState, useEffect } from 'react'
import type { ChangedFile, FileDiff } from '@shared/types/git'
import type { GitHubPullRequest } from '@shared/types/github'
import { Field, GhInput, GhSelect, GhTextarea, GhToggle, Sheet, SheetActions } from './github/GitHubUi'
import '../styles/panels.css'

type ChangesListProps = {
	files: ChangedFile[]
	selectedPath: string | null
	onSelect: (path: string) => void
	onDiscard?: (path: string) => void
	busy?: boolean
}

function splitPath(fullPath: string): { filename: string; dirname: string } {
	const lastSlash = fullPath.lastIndexOf('/')
	if (lastSlash === -1) {
		return { filename: fullPath, dirname: '' }
	}
	return {
		filename: fullPath.slice(lastSlash + 1),
		dirname: fullPath.slice(0, lastSlash),
	}
}

export function ChangesList({
	files,
	selectedPath,
	onSelect,
	onDiscard,
	busy,
}: ChangesListProps) {
	if (files.length === 0) {
		return (
			<div className="changes-list" role="list">
				<div className="empty-state">
					<p className="empty-state__text">Working tree clean</p>
					<p className="empty-state__subtext">No changed files detected</p>
				</div>
			</div>
		)
	}

	return (
		<div className="changes-list" role="list">
			<div className="changes-section">
				<div className="changes-section__header">
					<span className="changes-section__title">
						Files ({files.length})
					</span>
				</div>
				{files.map((file) => {
					const { filename, dirname } = splitPath(file.path)
					const isSelected = selectedPath === file.path

					return (
						<div
							key={file.path}
							className={`changes-list__row${isSelected ? ' is-selected' : ''}`}
						>
							<button
								type="button"
								className="changes-list__item"
								onClick={() => onSelect(file.path)}
								role="listitem"
							>
								<span className={`changes-list__status-tag changes-list__status-tag--${file.status}`}>
									{file.status[0]?.toUpperCase() || 'M'}
								</span>

								<div className="changes-list__names">
									<span className="changes-list__filename">{filename}</span>
									{dirname && (
										<span className="changes-list__dirname">{dirname}</span>
									)}
								</div>

								<div className="changes-list__stats">
									{file.additions !== undefined && file.additions > 0 && (
										<span className="changes-list__additions">+{file.additions}</span>
									)}
									{file.deletions !== undefined && file.deletions > 0 && (
										<span className="changes-list__deletions">-{file.deletions}</span>
									)}
								</div>
							</button>

							<div className="changes-list__actions">
								{onDiscard && (
									<button
										type="button"
										className="changes-list__discard-btn"
										onClick={() => onDiscard(file.path)}
										disabled={busy}
										title={`Discard ${filename}`}
										aria-label={`Discard changes to ${filename}`}
									>
										Discard
									</button>
								)}
							</div>
						</div>
					)
				})}
			</div>
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
				<p className="empty-state__text">Select a file to inspect changes</p>
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
					<p className="empty-state__text">No diff available for this file</p>
				</div>
			) : (
				diff.hunks.map((hunk, index) => (
					<div key={index} className="diff-hunk">
						<div className="diff-hunk__header">{hunk.header}</div>
						<div className="diff-hunk__lines">
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
					</div>
				))
			)}
		</div>
	)
}

type CommitPrSheetProps = {
	open: boolean
	fileCount: number
	currentBranch: string
	hasGitHub: boolean
	onClose: () => void
	onCommit: (data: { message: string; description?: string; branch?: string }) => Promise<void>
	busy?: boolean
	error?: string | null
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '')
		.slice(0, 28)
}

export function CommitPrSheet({
	open,
	fileCount,
	currentBranch,
	hasGitHub,
	onClose,
	onCommit,
	busy,
	error,
}: CommitPrSheetProps) {
	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	const [branchName, setBranchName] = useState('')
	const [userEditedBranch, setUserEditedBranch] = useState(false)

	const isDefaultBranch = !currentBranch || currentBranch === 'main' || currentBranch === 'master' || currentBranch === 'HEAD'

	useEffect(() => {
		if (open) {
			setTitle('')
			setDescription('')
			setBranchName('')
			setUserEditedBranch(false)
		}
	}, [open])

	const handleTitleChange = (val: string) => {
		setTitle(val)
		if (isDefaultBranch && !userEditedBranch) {
			const slug = slugify(val)
			setBranchName(slug ? `feat/${slug}` : '')
		}
	}

	const handleSubmit = () => {
		const trimmedTitle = title.trim()
		if (!trimmedTitle || busy) return
		void onCommit({
			message: trimmedTitle,
			description: description.trim() || undefined,
			branch: isDefaultBranch ? (branchName.trim() || undefined) : undefined,
		})
	}

	return (
		<Sheet
			open={open}
			title={hasGitHub ? 'Commit & Open Pull Request' : 'Commit Changes'}
			onClose={onClose}
		>
			{error && <div className="panel-alert panel-alert--error">{error}</div>}

			<div className="commit-sheet__summary">
				<div className="commit-sheet__badge commit-sheet__badge--staged">
					{fileCount} changed file{fileCount === 1 ? '' : 's'} (auto-staged)
				</div>
				{hasGitHub && !isDefaultBranch && (
					<div className="commit-sheet__badge">
						Branch: <code>{currentBranch}</code>
					</div>
				)}
			</div>

			<Field label="Title / Commit Message" hint="Press Enter or Ctrl+Enter to commit">
				<GhInput
					value={title}
					onChange={(e) => handleTitleChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault()
							handleSubmit()
						}
					}}
					placeholder="e.g. Add dark mode toggle or fix search bug"
					autoFocus
				/>
			</Field>

			{hasGitHub && isDefaultBranch && (
				<Field label="Feature Branch Name" hint="Branch to create and push to GitHub for this PR">
					<GhInput
						value={branchName}
						onChange={(e) => {
							setUserEditedBranch(true)
							setBranchName(e.target.value)
						}}
						placeholder="feat/my-feature"
					/>
				</Field>
			)}

			<Field label="Description (optional)" hint="Additional context for the PR description">
				<GhTextarea
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					onKeyDown={(e) => {
						if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
							e.preventDefault()
							handleSubmit()
						}
					}}
					rows={3}
					placeholder="Describe what changed..."
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
					disabled={!title.trim() || busy}
					onClick={handleSubmit}
				>
					{busy
						? 'Committing & Creating PR…'
						: hasGitHub
							? 'Commit & Open PR'
							: 'Commit Changes'}
				</button>
			</SheetActions>
		</Sheet>
	)
}

type PrMergeSheetProps = {
	open: boolean
	pr: GitHubPullRequest | null
	onClose: () => void
	onMerge: (method: 'squash' | 'merge' | 'rebase', deleteBranch: boolean) => Promise<void>
	busy?: boolean
	error?: string | null
}

export function PrMergeSheet({
	open,
	pr,
	onClose,
	onMerge,
	busy,
	error,
}: PrMergeSheetProps) {
	const [method, setMethod] = useState<'squash' | 'merge' | 'rebase'>('squash')
	const [deleteBranch, setDeleteBranch] = useState(true)

	if (!pr) return null

	return (
		<Sheet
			open={open}
			title={`PR #${pr.number}: ${pr.title}`}
			onClose={onClose}
		>
			{error && <div className="panel-alert panel-alert--error">{error}</div>}

			<div className="gh-pr-detail__meta" style={{ marginBottom: 'var(--space-md)' }}>
				<span className="gh-badge gh-badge--open">{pr.state}</span>
				<span><code>{pr.headBranch}</code> → <code>{pr.baseBranch}</code></span>
				{pr.changedFiles !== undefined && (
					<span>{pr.changedFiles} files · +{pr.additions ?? 0} −{pr.deletions ?? 0}</span>
				)}
			</div>

			{pr.body && (
				<p className="gh-repo-card__desc" style={{ marginBottom: 'var(--space-md)', whiteSpace: 'pre-wrap' }}>
					{pr.body}
				</p>
			)}

			<Field label="Merge method">
				<GhSelect value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
					<option value="squash">Squash and merge (Recommended)</option>
					<option value="merge">Create merge commit</option>
					<option value="rebase">Rebase and merge</option>
				</GhSelect>
			</Field>

			<GhToggle
				checked={deleteBranch}
				onChange={setDeleteBranch}
				label="Delete feature branch on GitHub after merge"
			/>

			<div style={{ marginTop: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
				<a href={pr.url} target="_blank" rel="noopener noreferrer" className="gh-link">
					View PR on GitHub ↗
				</a>
			</div>

			<SheetActions>
				<button
					type="button"
					className="btn btn--ghost"
					onClick={onClose}
					disabled={busy}
				>
					Done
				</button>
				<button
					type="button"
					className="btn btn--primary"
					disabled={busy}
					onClick={() => void onMerge(method, deleteBranch)}
				>
					{busy ? 'Merging & Syncing…' : 'Merge Pull Request'}
				</button>
			</SheetActions>
		</Sheet>
	)
}

