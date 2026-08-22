import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import {
	EditorView as CMView,
	drawSelection,
	dropCursor,
	highlightActiveLine,
	highlightActiveLineGutter,
	highlightSpecialChars,
	keymap,
	lineNumbers,
	rectangularSelection,
} from '@codemirror/view'
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
	redo as cmRedo,
	undo as cmUndo,
} from '@codemirror/commands'
import {
	bracketMatching,
	defaultHighlightStyle,
	foldGutter,
	foldKeymap,
	indentOnInput,
	syntaxHighlighting,
} from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'

// Language packages
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { go } from '@codemirror/lang-go'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'

export type CodeEditorHandle = {
	getSelection: () => { text: string; fromLine: number; toLine: number }
	undo: () => void
	redo: () => void
	focus: () => void
	gotoLine: (line: number) => void
}

type CodeEditorProps = {
	content: string
	filePath: string
	onChange: (newContent: string) => void
	onSave?: () => void
	readOnly?: boolean
}

function getLanguageExtension(path: string): Extension[] {
	const ext = path.includes('.') ? path.split('.').pop()?.toLowerCase() : ''
	switch (ext) {
		case 'ts':
			return [javascript({ typescript: true })]
		case 'tsx':
			return [javascript({ jsx: true, typescript: true })]
		case 'js':
			return [javascript()]
		case 'jsx':
			return [javascript({ jsx: true })]
		case 'json':
			return [json()]
		case 'html':
		case 'htm':
			return [html()]
		case 'css':
			return [css()]
		case 'md':
		case 'markdown':
			return [markdown()]
		case 'py':
			return [python()]
		case 'rs':
			return [rust()]
		case 'go':
			return [go()]
		case 'sql':
			return [sql()]
		case 'yaml':
		case 'yml':
			return [yaml()]
		default:
			return []
	}
}

const darkTheme = CMView.theme(
	{
		'&': {
			color: '#e5e4e8',
			backgroundColor: '#09090b',
			height: '100%',
			fontSize: '13px',
			fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", "Fira Code", Menlo, monospace',
		},
		'.cm-content': {
			caretColor: '#8b7ac8',
			padding: '8px 0',
		},
		'.cm-cursor': {
			borderLeftColor: '#8b7ac8',
			borderLeftWidth: '2px',
		},
		'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
			backgroundColor: 'rgba(139, 122, 200, 0.28)',
		},
		'.cm-gutters': {
			backgroundColor: '#0d0d10',
			color: '#63616d',
			borderRight: '1px solid #1e1d24',
			paddingRight: '6px',
		},
		'.cm-activeLineGutter': {
			backgroundColor: '#16161c',
			color: '#e5e4e8',
		},
		'.cm-activeLine': {
			backgroundColor: 'rgba(255, 255, 255, 0.03)',
		},
		'.cm-line': {
			padding: '0 8px',
		},
		'.cm-foldGutter span': {
			color: '#63616d',
		},
		'.cm-tooltip': {
			backgroundColor: '#16161c',
			border: '1px solid #292830',
			borderRadius: '6px',
			color: '#e5e4e8',
		},
		'.cm-tooltip-autocomplete ul li[aria-selected]': {
			backgroundColor: '#292834',
			color: '#e5e4e8',
		},
	},
	{ dark: true },
)

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
	{ content, filePath, onChange, onSave, readOnly = false },
	ref,
) {
	const containerRef = useRef<HTMLDivElement>(null)
	const viewRef = useRef<CMView | null>(null)
	const onSaveRef = useRef(onSave)
	onSaveRef.current = onSave

	const onChangeRef = useRef(onChange)
	onChangeRef.current = onChange

	const saveKeymap = useMemo(
		() =>
			keymap.of([
				{
					key: 'Mod-s',
					run: () => {
						onSaveRef.current?.()
						return true
					},
				},
				indentWithTab,
			]),
		[],
	)

	useImperativeHandle(
		ref,
		() => ({
			getSelection: () => {
				const view = viewRef.current
				if (!view) return { text: '', fromLine: 1, toLine: 1 }
				const { from, to } = view.state.selection.main
				const text = view.state.sliceDoc(from, to)
				const fromLine = view.state.doc.lineAt(from).number
				const toLine = view.state.doc.lineAt(to).number
				return { text, fromLine, toLine }
			},
			undo: () => {
				const view = viewRef.current
				if (view) {
					cmUndo(view)
				}
			},
			redo: () => {
				const view = viewRef.current
				if (view) {
					cmRedo(view)
				}
			},
			focus: () => {
				viewRef.current?.focus()
			},
			gotoLine: (lineNumber: number) => {
				const view = viewRef.current
				if (!view) return
				const totalLines = view.state.doc.lines
				const target = Math.max(1, Math.min(lineNumber, totalLines))
				const line = view.state.doc.line(target)
				view.dispatch({
					selection: { anchor: line.from, head: line.from },
					scrollIntoView: true,
				})
				view.focus()
			},
		}),
		[],
	)

	useEffect(() => {
		if (!containerRef.current) return

		const state = EditorState.create({
			doc: content,
			extensions: [
				lineNumbers(),
				highlightActiveLineGutter(),
				highlightSpecialChars(),
				history(),
				foldGutter(),
				drawSelection(),
				dropCursor(),
				EditorState.allowMultipleSelections.of(true),
				indentOnInput(),
				syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
				bracketMatching(),
				closeBrackets(),
				autocompletion(),
				rectangularSelection(),
				highlightActiveLine(),
				highlightSelectionMatches(),
				darkTheme,
				...getLanguageExtension(filePath),
				saveKeymap,
				keymap.of([
					...closeBracketsKeymap,
					...defaultKeymap,
					...searchKeymap,
					...historyKeymap,
					...foldKeymap,
					...completionKeymap,
				]),
				CMView.updateListener.of((update) => {
					if (update.docChanged) {
						onChangeRef.current(update.state.doc.toString())
					}
				}),
				EditorState.readOnly.of(readOnly),
			],
		})

		const view = new CMView({
			state,
			parent: containerRef.current,
		})

		viewRef.current = view

		return () => {
			view.destroy()
			viewRef.current = null
		}
		// We only want to recreate the view when filePath changes
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filePath, readOnly, saveKeymap])

	return <div className="code-editor-container" ref={containerRef} />
})
