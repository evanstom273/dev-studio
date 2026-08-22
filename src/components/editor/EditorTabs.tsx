import { IconClose, IconFile, IconPlus } from '../Icons'
import '../../styles/editor.css'

export type EditorTab = {
	path: string
	title: string
	content: string
	savedContent: string
	isDirty: boolean
}

type EditorTabsProps = {
	tabs: EditorTab[]
	activePath: string | null
	onSelectTab: (path: string) => void
	onCloseTab: (path: string) => void
	onNewTab?: () => void
}

export function EditorTabs({
	tabs,
	activePath,
	onSelectTab,
	onCloseTab,
	onNewTab,
}: EditorTabsProps) {
	return (
		<div className="editor-tabs" role="tablist" aria-label="Open editor files">
			<div className="editor-tabs__list">
				{tabs.map((tab) => {
					const isActive = activePath === tab.path
					return (
						<div
							key={tab.path}
							className={`editor-tab${isActive ? ' is-active' : ''}${tab.isDirty ? ' is-dirty' : ''}`}
							role="tab"
							aria-selected={isActive}
							title={tab.path}
							onClick={() => onSelectTab(tab.path)}
						>
							<IconFile className="editor-tab__icon" />
							<span className="editor-tab__title">{tab.title}</span>
							{tab.isDirty && <span className="editor-tab__dirty-dot" title="Unsaved changes">●</span>}
							<button
								type="button"
								className="editor-tab__close"
								onClick={(e) => {
									e.stopPropagation()
									onCloseTab(tab.path)
								}}
								aria-label={`Close ${tab.title}`}
								title="Close tab"
							>
								<IconClose className="editor-tab__close-icon" />
							</button>
						</div>
					)
				})}
			</div>

			{onNewTab && (
				<button
					type="button"
					className="editor-tabs__add-btn"
					onClick={onNewTab}
					title="Open file from project"
					aria-label="Open file"
				>
					<IconPlus className="editor-tabs__add-icon" />
				</button>
			)}
		</div>
	)
}
