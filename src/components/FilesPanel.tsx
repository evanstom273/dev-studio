import { useState } from 'react'
import type { FileTreeNode } from '../types/files'
import { IconChevron, IconFile, IconFolder } from './Icons'
import '../styles/panels.css'

type FileTreeProps = {
	nodes: FileTreeNode[]
	selectedPath: string | null
	onSelect: (path: string) => void
}

export function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
	return (
		<div className="file-tree" role="tree">
			{nodes.map((node) => (
				<FileTreeNodeItem
					key={node.path}
					node={node}
					selectedPath={selectedPath}
					onSelect={onSelect}
					depth={0}
				/>
			))}
		</div>
	)
}

type FileTreeNodeItemProps = {
	node: FileTreeNode
	selectedPath: string | null
	onSelect: (path: string) => void
	depth: number
}

function FileTreeNodeItem({ node, selectedPath, onSelect, depth }: FileTreeNodeItemProps) {
	const [expanded, setExpanded] = useState(depth < 2)

	if (node.kind === 'folder') {
		return (
			<div role="treeitem" aria-expanded={expanded}>
				<button
					type="button"
					className="file-tree__item file-tree__folder"
					style={{ paddingLeft: `${depth * 12 + 12}px` }}
					onClick={() => setExpanded(!expanded)}
				>
					<IconChevron className={`file-tree__chevron${expanded ? ' is-open' : ''}`} />
					<IconFolder className="file-tree__icon" />
					<span className="file-tree__name">{node.name}</span>
				</button>
				{expanded && node.children && (
					<div className="file-tree__children">
						{node.children.map((child) => (
							<FileTreeNodeItem
								key={child.path}
								node={child}
								selectedPath={selectedPath}
								onSelect={onSelect}
								depth={depth + 1}
							/>
						))}
					</div>
				)}
			</div>
		)
	}

	return (
		<button
			type="button"
			className={`file-tree__item${selectedPath === node.path ? ' is-selected' : ''}`}
			style={{ paddingLeft: `${depth * 12 + 28}px` }}
			onClick={() => onSelect(node.path)}
			role="treeitem"
		>
			<IconFile className="file-tree__icon" />
			<span className="file-tree__name">{node.name}</span>
		</button>
	)
}

type FileContentProps = {
	content: string | null
	path: string | null
}

export function FileContent({ content, path }: FileContentProps) {
	if (!path || content === null) {
		return (
			<div className="empty-state">
				<p className="empty-state__text">Select a file to view its contents</p>
			</div>
		)
	}

	return (
		<div className="file-content">
			<div className="diff-view__header">
				<span className="diff-view__path">{path}</span>
			</div>
			<pre className="file-content__code">{content}</pre>
		</div>
	)
}
