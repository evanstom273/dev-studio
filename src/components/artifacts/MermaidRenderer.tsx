import { useEffect, useId, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { IconCode, IconDiagram } from '../Icons'
import '../../styles/artifacts.css'

type MermaidRendererProps = {
	chart: string
	showSourceToggle?: boolean
}

let mermaidInitialized = false

function initMermaid() {
	if (mermaidInitialized) return
	try {
		mermaid.initialize({
			startOnLoad: false,
			theme: 'dark',
			themeVariables: {
				darkMode: true,
				background: '#09090b',
				primaryColor: '#8b7ac8',
				primaryTextColor: '#e5e4e8',
				primaryBorderColor: '#3a3845',
				lineColor: '#92909a',
				secondaryColor: '#16161c',
				tertiaryColor: '#111115',
			},
			securityLevel: 'loose',
			fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", "Fira Code", Menlo, monospace',
		})
		mermaidInitialized = true
	} catch {
		// ignore
	}
}

export function MermaidRenderer({ chart, showSourceToggle = true }: MermaidRendererProps) {
	const rawId = useId()
	const containerRef = useRef<HTMLDivElement>(null)
	const [svg, setSvg] = useState<string>('')
	const [error, setError] = useState<string | null>(null)
	const [viewMode, setViewMode] = useState<'diagram' | 'source'>('diagram')

	useEffect(() => {
		initMermaid()
		let cancelled = false
		const elementId = `mermaid_${rawId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`

		async function renderChart() {
			if (!chart.trim()) {
				setSvg('')
				setError(null)
				return
			}

			try {
				const { svg: renderedSvg } = await mermaid.render(elementId, chart.trim())
				if (!cancelled) {
					setSvg(renderedSvg)
					setError(null)
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : 'Invalid Mermaid syntax')
					setSvg('')
				}
			}
		}

		void renderChart()

		return () => {
			cancelled = true
		}
	}, [chart, rawId])

	return (
		<div className="mermaid-container">
			{showSourceToggle && (
				<div className="mermaid-toolbar">
					<div className="mermaid-toolbar__group">
						<button
							type="button"
							className={`mermaid-toggle-btn${viewMode === 'diagram' ? ' is-active' : ''}`}
							onClick={() => setViewMode('diagram')}
						>
							<IconDiagram className="mermaid-toggle-btn__icon" />
							<span>Diagram</span>
						</button>
						<button
							type="button"
							className={`mermaid-toggle-btn${viewMode === 'source' ? ' is-active' : ''}`}
							onClick={() => setViewMode('source')}
						>
							<IconCode className="mermaid-toggle-btn__icon" />
							<span>Source</span>
						</button>
					</div>
				</div>
			)}

			{viewMode === 'source' ? (
				<pre className="mermaid-source">
					<code>{chart}</code>
				</pre>
			) : error ? (
				<div className="mermaid-error">
					<p className="mermaid-error__title">Failed to render Mermaid diagram</p>
					<p className="mermaid-error__msg">{error}</p>
					<pre className="mermaid-source">
						<code>{chart}</code>
					</pre>
				</div>
			) : (
				<div
					className="mermaid-svg-wrapper"
					ref={containerRef}
					dangerouslySetInnerHTML={{ __html: svg }}
				/>
			)}
		</div>
	)
}
