import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git'
import type {
	ChangedFile,
	FileDiff,
	FileTreeNode,
	GitBranch,
	GitCommit,
	GitStatus,
	MergeConflict,
} from '../types/git.js'
import { runShell } from '../utils/exec.js'

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage'])

export class GitService {
	private git(cwd: string): SimpleGit {
		return simpleGit({ baseDir: cwd })
	}

	async isRepo(path: string): Promise<boolean> {
		try {
			return await this.git(path).checkIsRepo()
		} catch {
			return false
		}
	}

	async init(path: string): Promise<void> {
		await this.git(path).init()
	}

	async status(projectPath: string): Promise<GitStatus> {
		const git = this.git(projectPath)
		const isRepo = await git.checkIsRepo()
		if (!isRepo) {
			return {
				branch: '',
				ahead: 0,
				behind: 0,
				changed: [],
				clean: true,
				hasConflicts: false,
			}
		}

		const status: StatusResult = await git.status()
		const branch = status.current ?? 'HEAD'
		let ahead = 0
		let behind = 0

		try {
			const summary = await git.raw(['rev-list', '--left-right', '--count', `${branch}...@{upstream}`])
			const [a, b] = summary.trim().split('\t').map(Number)
			ahead = a ?? 0
			behind = b ?? 0
		} catch {
			// no upstream
		}

		const changed = this.mapStatus(status)
		const hasConflicts = changed.some((f) => f.status === 'conflicted')

		return {
			branch,
			ahead,
			behind,
			changed,
			clean: changed.length === 0,
			hasConflicts,
		}
	}

	private mapStatus(status: StatusResult): ChangedFile[] {
		const files: ChangedFile[] = []

		for (const path of status.modified) {
			files.push({ path, status: 'modified', staged: false })
		}
		for (const path of status.not_added) {
			files.push({ path, status: 'untracked', staged: false })
		}
		for (const path of status.deleted) {
			files.push({ path, status: 'deleted', staged: false })
		}
		for (const path of status.conflicted) {
			files.push({ path, status: 'conflicted', staged: false })
		}
		for (const path of status.created) {
			files.push({ path, status: 'added', staged: true })
		}
		for (const item of status.staged) {
			if (!files.some((f) => f.path === item && f.staged)) {
				files.push({ path: item, status: 'modified', staged: true })
			}
		}
		for (const item of status.renamed) {
			files.push({ path: item.to, status: 'renamed', oldPath: item.from, staged: true })
		}

		return files
	}

	async diff(projectPath: string, filePath?: string, staged = false): Promise<FileDiff | null> {
		const git = this.git(projectPath)
		const args = ['diff', '--unified=3']
		if (staged) args.push('--cached')
		if (filePath) args.push('--', filePath)

		const raw = await git.raw(args)
		if (!raw.trim()) return filePath ? { path: filePath, hunks: [] } : null

		return {
			path: filePath ?? '',
			hunks: parseDiff(raw),
		}
	}

	async log(projectPath: string, limit = 30): Promise<GitCommit[]> {
		const git = this.git(projectPath)
		const log = await git.log({ maxCount: limit })
		return log.all.map((entry) => ({
			hash: entry.hash,
			shortHash: entry.hash.slice(0, 7),
			message: entry.message,
			author: entry.author_name,
			date: entry.date,
		}))
	}

	async branches(projectPath: string): Promise<GitBranch[]> {
		const git = this.git(projectPath)
		const summary = await git.branch(['-vv'])
		return summary.all.map((name) => {
			const info = summary.branches[name]
			return {
				name,
				current: name === summary.current,
				remote: info?.label?.split(' ')[0],
			}
		})
	}

	async stage(projectPath: string, paths: string[]): Promise<void> {
		await this.git(projectPath).add(paths)
	}

	async unstage(projectPath: string, paths: string[]): Promise<void> {
		await this.git(projectPath).reset(['HEAD', '--', ...paths])
	}

	async commit(projectPath: string, message: string): Promise<string> {
		const result = await this.git(projectPath).commit(message)
		return result.commit
	}

	async fetch(projectPath: string, remote = 'origin'): Promise<void> {
		await this.git(projectPath).fetch(remote)
	}

	async pull(projectPath: string, remote = 'origin', branch?: string, rebase = false): Promise<void> {
		const git = this.git(projectPath)
		if (rebase) {
			await git.pull(remote, branch, { '--rebase': null })
		} else {
			await git.pull(remote, branch)
		}
	}

	async push(projectPath: string, remote = 'origin', branch?: string, force = false): Promise<void> {
		const git = this.git(projectPath)
		if (force) {
			await git.push(remote, branch, { '--force': null })
		} else {
			await git.push(remote, branch)
		}
	}

	async checkout(projectPath: string, branch: string, create = false): Promise<void> {
		const git = this.git(projectPath)
		if (create) {
			await git.checkoutLocalBranch(branch)
		} else {
			await git.checkout(branch)
		}
	}

	async merge(projectPath: string, branch: string): Promise<{ success: boolean; conflicts: MergeConflict[] }> {
		try {
			await this.git(projectPath).merge([branch])
			return { success: true, conflicts: [] }
		} catch {
			const conflicts = await this.getConflicts(projectPath)
			return { success: false, conflicts }
		}
	}

	async getConflicts(projectPath: string): Promise<MergeConflict[]> {
		const status = await this.status(projectPath)
		return status.changed
			.filter((f: ChangedFile) => f.status === 'conflicted')
			.map((f: ChangedFile) => ({ path: f.path, status: 'both_modified' as const }))
	}

	async discard(projectPath: string, paths: string[]): Promise<void> {
		const git = this.git(projectPath)
		await git.checkout(['--', ...paths])
	}

	async revert(projectPath: string, commitHash: string): Promise<void> {
		await this.git(projectPath).revert(commitHash)
	}

	async addRemote(projectPath: string, name: string, url: string): Promise<void> {
		await this.git(projectPath).addRemote(name, url)
	}

	async clone(url: string, targetPath: string): Promise<void> {
		await simpleGit().clone(url, targetPath)
	}

	async getDefaultBranch(projectPath: string): Promise<string | undefined> {
		try {
			const branch = await this.git(projectPath).raw(['symbolic-ref', '--short', 'HEAD'])
			return branch.trim() || undefined
		} catch {
			return undefined
		}
	}

	async hasRemote(projectPath: string): Promise<boolean> {
		const remotes = await this.git(projectPath).getRemotes()
		return remotes.length > 0
	}
}

export class FileService {
	async tree(projectPath: string, maxDepth = 4): Promise<FileTreeNode[]> {
		return buildTree(projectPath, projectPath, 0, maxDepth)
	}

	async read(projectPath: string, filePath: string): Promise<string | null> {
		const full = join(projectPath, filePath)
		try {
			const info = await stat(full)
			if (!info.isFile()) return null
			if (info.size > 512 * 1024) return '[File too large to display]'
			return await readFile(full, 'utf8')
		} catch {
			return null
		}
	}
}

async function buildTree(
	root: string,
	current: string,
	depth: number,
	maxDepth: number,
): Promise<FileTreeNode[]> {
	if (depth > maxDepth) return []

	let entries: string[]
	try {
		entries = await readdir(current)
	} catch {
		return []
	}

	entries.sort((a, b) => a.localeCompare(b))
	const nodes: FileTreeNode[] = []

	for (const entry of entries) {
		if (entry.startsWith('.') && entry !== '.env.example') continue
		if (IGNORE_DIRS.has(entry)) continue

		const full = join(current, entry)
		const rel = relative(root, full)
		try {
			const info = await stat(full)
			if (info.isDirectory()) {
				const children = await buildTree(root, full, depth + 1, maxDepth)
				nodes.push({ name: entry, path: rel, kind: 'folder', children })
			} else if (info.isFile()) {
				nodes.push({ name: entry, path: rel, kind: 'file' })
			}
		} catch {
			// skip
		}
	}

	return nodes
}

function parseDiff(raw: string): FileDiff['hunks'] {
	const hunks: FileDiff['hunks'] = []
	let current: FileDiff['hunks'][0] | null = null
	let oldLine = 0
	let newLine = 0

	for (const line of raw.split('\n')) {
		if (line.startsWith('@@')) {
			if (current) hunks.push(current)
			current = { header: line, lines: [] }
			const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/)
			oldLine = match ? Number.parseInt(match[1], 10) : 0
			newLine = match ? Number.parseInt(match[2], 10) : 0
			continue
		}
		if (!current) continue

		if (line.startsWith('+')) {
			current.lines.push({ type: 'add', content: line, newLineNumber: newLine++ })
		} else if (line.startsWith('-')) {
			current.lines.push({ type: 'remove', content: line, oldLineNumber: oldLine++ })
		} else if (line.startsWith(' ') || line === '') {
			current.lines.push({
				type: 'context',
				content: line || ' ',
				oldLineNumber: oldLine++,
				newLineNumber: newLine++,
			})
		}
	}

	if (current) hunks.push(current)
	return hunks
}

export async function runProjectCommand(
	projectPath: string,
	command: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	return runShell(projectPath, command)
}
