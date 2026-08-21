import type { ChangeStatus, ChangedFile, FileDiff } from '../types/files'
import '../styles/panels.css'

type ChangesListProps = {
	files: ChangedFile[]
	selectedPath: string | null
	onSelect: (path: string) => void
}

const STATUS_LABELS: Record<ChangeStatus, string> = {
	modified: 'Modified',
	added: 'Added',
	deleted: 'Deleted',
}

export function ChangesList({ files, selectedPath, onSelect }: ChangesListProps) {
	return (
		<div className="changes-list" role="list">
			{files.map((file) => (
				<button
					key={file.path}
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
			{diff.hunks.map((hunk, index) => (
				<div key={index} className="diff-hunk">
					<div className="diff-hunk__header">{hunk.header}</div>
					{hunk.lines.map((line, lineIndex) => (
						<div
							key={lineIndex}
							className={`diff-line diff-line--${line.type === 'context' ? 'context' : line.type}`}
						>
							<span className="diff-line__num">
								{line.oldLineNumber ?? ''}
							</span>
							<span className="diff-line__num">
								{line.newLineNumber ?? ''}
							</span>
							<span className="diff-line__content">{line.content}</span>
						</div>
					))}
				</div>
			))}
		</div>
	)
}
