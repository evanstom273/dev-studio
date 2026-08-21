import type { ChangeStatus, ChangedFile, FileDiff } from '@shared/types/git'
import '../styles/panels.css'

type ChangesListProps = {
	files: ChangedFile[]
	selectedPath: string | null
	onSelect: (path: string) => void
	onStage?: (path: string) => void
	onDiscard?: (path: string) => void
}

const STATUS_LABELS: Record<ChangeStatus, string> = {
	modified: 'Modified',
	added: 'Added',
	deleted: 'Deleted',
	renamed: 'Renamed',
	untracked: 'New',
	conflicted: 'Conflict',
}

export function ChangesList({ files, selectedPath, onSelect, onStage, onDiscard }: ChangesListProps) {
	return (
		<div className="changes-list" role="list">
			{files.length === 0 && (
				<div className="empty-state">
					<p className="empty-state__text">No changes</p>
				</div>
			)}
			{files.map((file) => (
				<div key={`${file.path}:${file.staged}`} className="changes-list__row">
					<button
						type="button"
						className={`changes-list__item${selectedPath === file.path ? ' is-selected' : ''}`}
						onClick={() => onSelect(file.path)}
						role="listitem"
					>
						<span className={`changes-list__status changes-list__status--${file.status}`}>
							{file.staged ? 'Staged' : STATUS_LABELS[file.status]}
						</span>
						<span className="changes-list__path">{file.path}</span>
					</button>
					<div className="changes-list__actions">
						{onStage && !file.staged && (
							<button type="button" className="btn btn--ghost btn--xs" onClick={() => onStage(file.path)}>
								Stage
							</button>
						)}
						{onDiscard && (
							<button type="button" className="btn btn--ghost btn--xs" onClick={() => onDiscard(file.path)}>
								Discard
							</button>
						)}
					</div>
				</div>
			))}
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
				<div className="empty-state"><p className="empty-state__text">No diff available</p></div>
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
