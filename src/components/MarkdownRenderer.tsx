import { useMemo, useState } from 'react'
import { marked, type Token, type Tokens } from 'marked'
import { IconCheck, IconCopy } from './Icons'

export function CodeBlock({ language, code }: { language: string; code: string }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// clipboard permission error
		}
	}

	return (
		<div className="code-block">
			<div className="code-block__header">
				<span className="code-block__lang">{language || 'code'}</span>
				<button
					type="button"
					className="code-block__copy-btn"
					onClick={handleCopy}
					aria-label="Copy code block"
					title="Copy code"
				>
					{copied ? (
						<>
							<IconCheck className="code-block__copy-icon" />
							<span className="code-block__copy-text">Copied!</span>
						</>
					) : (
						<>
							<IconCopy className="code-block__copy-icon" />
							<span className="code-block__copy-text">Copy code</span>
						</>
					)}
				</button>
			</div>
			<pre className="code-block__pre">
				<code className="code-block__code">{code}</code>
			</pre>
		</div>
	)
}

function renderInlineTokens(tokens: Token[] | undefined): React.ReactNode {
	if (!tokens || tokens.length === 0) return null

	return tokens.map((token, idx) => {
		switch (token.type) {
			case 'strong': {
				const strong = token as Tokens.Strong
				return <strong key={idx}>{renderInlineTokens(strong.tokens)}</strong>
			}
			case 'em': {
				const em = token as Tokens.Em
				return <em key={idx}>{renderInlineTokens(em.tokens)}</em>
			}
			case 'codespan': {
				const codespan = token as Tokens.Codespan
				return (
					<code key={idx} className="inline-code">
						{codespan.text}
					</code>
				)
			}
			case 'del': {
				const del = token as Tokens.Del
				return <del key={idx}>{renderInlineTokens(del.tokens)}</del>
			}
			case 'link': {
				const link = token as Tokens.Link
				return (
					<a
						key={idx}
						href={link.href}
						title={link.title ?? undefined}
						target="_blank"
						rel="noopener noreferrer"
						className="markdown-link"
					>
						{renderInlineTokens(link.tokens) || link.text}
					</a>
				)
			}
			case 'image': {
				const image = token as Tokens.Image
				return (
					<img
						key={idx}
						src={image.href}
						alt={image.text}
						title={image.title ?? undefined}
						className="markdown-image"
						loading="lazy"
					/>
				)
			}
			case 'br':
				return <br key={idx} />
			case 'escape': {
				const esc = token as Tokens.Escape
				return <span key={idx}>{esc.text}</span>
			}
			case 'text': {
				const txt = token as Tokens.Text
				if (txt.tokens && txt.tokens.length > 0) {
					return <span key={idx}>{renderInlineTokens(txt.tokens)}</span>
				}
				return txt.text
			}
			default:
				if ('tokens' in token && Array.isArray(token.tokens)) {
					return <span key={idx}>{renderInlineTokens(token.tokens)}</span>
				}
				return 'text' in token && typeof token.text === 'string' ? token.text : null
		}
	})
}

function renderListItemTokens(
	tokens: Token[] | undefined,
	fallbackText: string,
	isTask: boolean,
): React.ReactNode {
	if (!tokens || tokens.length === 0) {
		return fallbackText
	}
	const filtered = isTask ? tokens.filter((t) => t.type !== 'checkbox') : tokens
	return filtered.map((token, idx) => {
		if (token.type === 'text') {
			const txt = token as Tokens.Text
			if (txt.tokens && txt.tokens.length > 0) {
				return <span key={idx}>{renderInlineTokens(txt.tokens)}</span>
			}
			return <span key={idx}>{txt.text}</span>
		}
		if (token.type === 'paragraph') {
			const para = token as Tokens.Paragraph
			if (para.tokens && para.tokens.length > 0) {
				return <span key={idx}>{renderInlineTokens(para.tokens)}</span>
			}
			return <span key={idx}>{para.text}</span>
		}
		return renderBlockToken(token, idx)
	})
}

function renderBlockToken(token: Token, index: number): React.ReactNode {
	switch (token.type) {
		case 'heading': {
			const heading = token as Tokens.Heading
			const content = renderInlineTokens(heading.tokens) || heading.text
			switch (heading.depth) {
				case 1:
					return (
						<h1 key={index} className="markdown-h1">
							{content}
						</h1>
					)
				case 2:
					return (
						<h2 key={index} className="markdown-h2">
							{content}
						</h2>
					)
				case 3:
					return (
						<h3 key={index} className="markdown-h3">
							{content}
						</h3>
					)
				case 4:
					return (
						<h4 key={index} className="markdown-h4">
							{content}
						</h4>
					)
				case 5:
					return (
						<h5 key={index} className="markdown-h5">
							{content}
						</h5>
					)
				case 6:
				default:
					return (
						<h6 key={index} className="markdown-h6">
							{content}
						</h6>
					)
			}
		}
		case 'paragraph': {
			const para = token as Tokens.Paragraph
			return (
				<p key={index} className="markdown-p">
					{renderInlineTokens(para.tokens) || para.text}
				</p>
			)
		}
		case 'code': {
			const code = token as Tokens.Code
			return <CodeBlock key={index} language={code.lang ?? ''} code={code.text} />
		}
		case 'blockquote': {
			const bq = token as Tokens.Blockquote
			return (
				<blockquote key={index} className="markdown-blockquote">
					{bq.tokens ? bq.tokens.map((t, idx) => renderBlockToken(t, idx)) : bq.text}
				</blockquote>
			)
		}
		case 'list': {
			const list = token as Tokens.List
			const ListTag = list.ordered ? 'ol' : 'ul'
			const listClass = list.ordered ? 'markdown-ol' : 'markdown-ul'
			const start = list.ordered && typeof list.start === 'number' ? list.start : undefined
			return (
				<ListTag key={index} start={start} className={listClass}>
					{list.items.map((item: Tokens.ListItem, iIdx: number) => (
						<li
							key={iIdx}
							className={`markdown-li ${item.task ? 'markdown-task-item' : ''}`}
						>
							{item.task && (
								<input
									type="checkbox"
									checked={item.checked}
									readOnly
									className="markdown-task-checkbox"
								/>
							)}
							<div className="markdown-li-content">
								{renderListItemTokens(item.tokens, item.text, item.task)}
							</div>
						</li>
					))}
				</ListTag>
			)
		}
		case 'table': {
			const table = token as Tokens.Table
			return (
				<div key={index} className="markdown-table-wrapper">
					<table className="markdown-table">
						<thead>
							<tr>
								{table.header.map((cell: Tokens.TableCell, cIdx: number) => (
									<th
										key={cIdx}
										style={{ textAlign: cell.align ?? undefined }}
									>
										{renderInlineTokens(cell.tokens) || cell.text}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{table.rows.map((row: Tokens.TableCell[], rIdx: number) => (
								<tr key={rIdx}>
									{row.map((cell: Tokens.TableCell, cIdx: number) => (
										<td
											key={cIdx}
											style={{ textAlign: cell.align ?? undefined }}
										>
											{renderInlineTokens(cell.tokens) || cell.text}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)
		}
		case 'hr':
			return <hr key={index} className="markdown-hr" />
		case 'space':
			return null
		case 'def':
			return null
		default:
			if ('tokens' in token && Array.isArray(token.tokens)) {
				return <div key={index}>{token.tokens.map((t, idx) => renderBlockToken(t, idx))}</div>
			}
			return 'text' in token && typeof token.text === 'string' ? (
				<p key={index} className="markdown-p">{token.text}</p>
			) : null
	}
}

export function MarkdownRenderer({ content }: { content: string }) {
	const tokens = useMemo(() => {
		try {
			return marked.lexer(content, { gfm: true, breaks: true })
		} catch {
			return []
		}
	}, [content])

	if (tokens.length === 0) {
		return <p className="markdown-p">{content}</p>
	}

	return (
		<div className="markdown-body">
			{tokens.map((token, i) => renderBlockToken(token, i))}
		</div>
	)
}
