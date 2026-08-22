import { useMemo, useState } from 'react'
import type { Artifact, ArtifactType } from '@shared/types/artifact'
import {
	IconArtifact,
	IconCode,
	IconDiagram,
	IconDocument,
	IconPlus,
	IconSearch,
	IconTrash,
} from '../Icons'
import '../../styles/artifacts.css'

type ArtifactListProps = {
	artifacts: Artifact[]
	selectedId: string | null
	onSelect: (id: string) => void
	onCreateNew: () => void
	onDelete: (id: string) => void
}

const TYPE_FILTERS: { id: ArtifactType | 'all'; label: string }[] = [
	{ id: 'all', label: 'All' },
	{ id: 'markdown', label: 'Markdown' },
	{ id: 'code', label: 'Code' },
	{ id: 'mermaid', label: 'Diagrams' },
	{ id: 'text', label: 'Text' },
]

function getArtifactIcon(type: ArtifactType) {
	switch (type) {
		case 'markdown':
			return IconDocument
		case 'mermaid':
			return IconDiagram
		case 'code':
			return IconCode
		default:
			return IconArtifact
	}
}

function formatRelativeTime(dateStr: string): string {
	try {
		const diff = Date.now() - new Date(dateStr).getTime()
		const sec = Math.floor(diff / 1000)
		if (sec < 60) return 'just now'
		const min = Math.floor(sec / 60)
		if (min < 60) return `${min}m ago`
		const hrs = Math.floor(min / 60)
		if (hrs < 24) return `${hrs}h ago`
		const days = Math.floor(hrs / 24)
		return `${days}d ago`
	} catch {
		return dateStr
	}
}

export function ArtifactList({
	artifacts,
	selectedId,
	onSelect,
	onCreateNew,
	onDelete,
}: ArtifactListProps) {
	const [searchQuery, setSearchQuery] = useState('')
	const [typeFilter, setTypeFilter] = useState<ArtifactType | 'all'>('all')
	const [sortBy, setSortBy] = useState<'recent' | 'title'>('recent')

	const filtered = useMemo(() => {
		return artifacts
			.filter((art) => {
				const matchesType = typeFilter === 'all' || art.type === typeFilter
				const q = searchQuery.toLowerCase().trim()
				const matchesSearch =
					!q ||
					art.title.toLowerCase().includes(q) ||
					art.tags?.some((t) => t.toLowerCase().includes(q)) ||
					art.content.toLowerCase().includes(q)
				return matchesType && matchesSearch
			})
			.sort((a, b) => {
				if (sortBy === 'title') {
					return a.title.localeCompare(b.title)
				}
				return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
			})
	}, [artifacts, typeFilter, searchQuery, sortBy])

	return (
		<div className="artifact-list-panel">
			{/* Top bar with search and create */}
			<div className="artifact-list-header">
				<div className="artifact-list-search">
					<IconSearch className="artifact-list-search__icon" />
					<input
						type="text"
						className="artifact-list-search__input"
						placeholder="Search artifacts..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>

				<button
					type="button"
					className="artifact-create-btn"
					onClick={onCreateNew}
					title="Create new artifact"
				>
					<IconPlus className="artifact-create-btn__icon" />
					<span>New</span>
				</button>
			</div>

			{/* Filter Pills */}
			<div className="artifact-filter-bar">
				<div className="artifact-filter-pills" role="tablist">
					{TYPE_FILTERS.map((f) => {
						const isActive = typeFilter === f.id
						return (
							<button
								key={f.id}
								type="button"
								role="tab"
								aria-selected={isActive}
								className={`artifact-filter-pill${isActive ? ' is-active' : ''}`}
								onClick={() => setTypeFilter(f.id)}
							>
								{f.label}
							</button>
						)
					})}
				</div>

				<select
					className="artifact-sort-select"
					value={sortBy}
					onChange={(e) => setSortBy(e.target.value as 'recent' | 'title')}
					aria-label="Sort artifacts"
				>
					<option value="recent">Recent</option>
					<option value="title">Title</option>
				</select>
			</div>

			{/* List Items */}
			<div className="artifact-items" role="list">
				{filtered.length === 0 ? (
					<div className="artifact-empty-state">
						<IconArtifact className="artifact-empty-state__icon" />
						<p className="artifact-empty-state__title">No artifacts found</p>
						<p className="artifact-empty-state__subtitle">
							{artifacts.length === 0
								? 'Create implementation plans, architecture specs, diagrams or snippets.'
								: 'Try adjusting your search query or filter.'}
						</p>
						{artifacts.length === 0 && (
							<button
								type="button"
								className="editor-btn editor-btn--primary"
								onClick={onCreateNew}
							>
								Create Artifact
							</button>
						)}
					</div>
				) : (
					filtered.map((art) => {
						const Icon = getArtifactIcon(art.type)
						const isSelected = selectedId === art.id
						return (
							<div
								key={art.id}
								role="listitem"
								className={`artifact-card${isSelected ? ' is-selected' : ''}`}
								onClick={() => onSelect(art.id)}
							>
								<div className="artifact-card__icon-wrap">
									<Icon className="artifact-card__icon" />
								</div>
								<div className="artifact-card__body">
									<div className="artifact-card__top">
										<span className="artifact-card__title" title={art.title}>
											{art.title}
										</span>
										<span className="artifact-card__time">
											{formatRelativeTime(art.updatedAt)}
										</span>
									</div>
									<div className="artifact-card__meta">
										<span className={`artifact-badge artifact-badge--${art.type}`}>
											{art.type}
										</span>
										{art.tags && art.tags.length > 0 && (
											<span className="artifact-card__tag">#{art.tags[0]}</span>
										)}
									</div>
								</div>
								<button
									type="button"
									className="artifact-card__delete"
									onClick={(e) => {
										e.stopPropagation()
										onDelete(art.id)
									}}
									aria-label={`Delete ${art.title}`}
									title="Delete artifact"
								>
									<IconTrash className="artifact-card__delete-icon" />
								</button>
							</div>
						)
					})
				)}
			</div>
		</div>
	)
}
