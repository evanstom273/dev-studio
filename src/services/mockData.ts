import type { ConversationItem } from '../types/agent'
import type { ChangedFile, FileDiff, FileTreeNode } from '../types/files'
import type { Project } from '../types/project'

export const MOCK_PROJECTS: Project[] = [
	{
		id: 'unwritten-worlds',
		name: 'Unwritten Worlds',
		repositoryLabel: 'evanstom273/unwritten-worlds',
		lastActivity: '2 hours ago',
	},
	{
		id: 'dev-studio',
		name: 'Dev Studio',
		repositoryLabel: 'evanstom273/dev-studio',
		lastActivity: 'Just now',
	},
	{
		id: 'minecraft-mod',
		name: 'Minecraft Mod',
		repositoryLabel: '~/projects/minecraft-mod',
		lastActivity: 'Yesterday',
	},
]

export const MOCK_CONVERSATION: ConversationItem[] = [
	{
		id: 'msg-1',
		kind: 'message',
		role: 'user',
		content:
			'Add procedural terrain generation to the world module. Keep chunk loading async and avoid blocking the main thread.',
		timestamp: '14:32',
	},
	{
		id: 'act-1',
		kind: 'activity',
		status: 'complete',
		label: 'Reading files...',
		timestamp: '14:32',
	},
	{
		id: 'act-2',
		kind: 'activity',
		status: 'complete',
		label: 'Editing TerrainGenerator.ts...',
		timestamp: '14:33',
	},
	{
		id: 'msg-2',
		kind: 'message',
		role: 'agent',
		content:
			'I added a `TerrainGenerator` class with Perlin noise heightmaps. Chunks generate on a worker thread and stream into the world grid. The main changes are in `src/game/TerrainGenerator.ts` and `src/game/World.ts`.',
		timestamp: '14:34',
	},
	{
		id: 'act-3',
		kind: 'activity',
		status: 'complete',
		label: 'Running npm build...',
		timestamp: '14:35',
	},
	{
		id: 'act-4',
		kind: 'activity',
		status: 'complete',
		label: 'Build passed',
		timestamp: '14:35',
	},
]

export const MOCK_CHANGED_FILES: ChangedFile[] = [
	{ path: 'src/game/World.ts', status: 'modified' },
	{ path: 'src/game/TerrainGenerator.ts', status: 'added' },
	{ path: 'src/styles/game.css', status: 'modified' },
]

export const MOCK_DIFFS: Record<string, FileDiff> = {
	'src/game/World.ts': {
		path: 'src/game/World.ts',
		hunks: [
			{
				header: '@@ -12,6 +12,14 @@ export class World {',
				lines: [
					{ type: 'context', content: '  private chunks: Map<string, Chunk> = new Map()', oldLineNumber: 12, newLineNumber: 12 },
					{ type: 'context', content: '  private seed: number', oldLineNumber: 13, newLineNumber: 13 },
					{ type: 'remove', content: '-  constructor(seed: number) {', oldLineNumber: 14 },
					{ type: 'remove', content: '-    this.seed = seed', oldLineNumber: 15 },
					{ type: 'add', content: '+  private generator: TerrainGenerator', newLineNumber: 14 },
					{ type: 'add', content: '+', newLineNumber: 15 },
					{ type: 'add', content: '+  constructor(seed: number) {', newLineNumber: 16 },
					{ type: 'add', content: '+    this.seed = seed', newLineNumber: 17 },
					{ type: 'add', content: '+    this.generator = new TerrainGenerator(seed)', newLineNumber: 18 },
					{ type: 'context', content: '  }', oldLineNumber: 16, newLineNumber: 19 },
				],
			},
		],
	},
	'src/game/TerrainGenerator.ts': {
		path: 'src/game/TerrainGenerator.ts',
		hunks: [
			{
				header: '@@ -0,0 +1,28 @@',
				lines: [
					{ type: 'add', content: '+import { PerlinNoise } from "./noise"', newLineNumber: 1 },
					{ type: 'add', content: '+', newLineNumber: 2 },
					{ type: 'add', content: '+export class TerrainGenerator {', newLineNumber: 3 },
					{ type: 'add', content: '+  private noise: PerlinNoise', newLineNumber: 4 },
					{ type: 'add', content: '+', newLineNumber: 5 },
					{ type: 'add', content: '+  constructor(seed: number) {', newLineNumber: 6 },
					{ type: 'add', content: '+    this.noise = new PerlinNoise(seed)', newLineNumber: 7 },
					{ type: 'add', content: '+  }', newLineNumber: 8 },
					{ type: 'add', content: '+', newLineNumber: 9 },
					{ type: 'add', content: '+  generateChunk(x: number, z: number): Float32Array {', newLineNumber: 10 },
					{ type: 'add', content: '+    const size = 16 * 16', newLineNumber: 11 },
					{ type: 'add', content: '+    const heights = new Float32Array(size)', newLineNumber: 12 },
					{ type: 'add', content: '+    // ... heightmap generation', newLineNumber: 13 },
					{ type: 'add', content: '+    return heights', newLineNumber: 14 },
					{ type: 'add', content: '+  }', newLineNumber: 15 },
					{ type: 'add', content: '+}', newLineNumber: 16 },
				],
			},
		],
	},
	'src/styles/game.css': {
		path: 'src/styles/game.css',
		hunks: [
			{
				header: '@@ -44,3 +44,8 @@',
				lines: [
					{ type: 'context', content: '  background: var(--surface-1)', oldLineNumber: 44, newLineNumber: 44 },
					{ type: 'context', content: '}', oldLineNumber: 45, newLineNumber: 45 },
					{ type: 'add', content: '+', newLineNumber: 46 },
					{ type: 'add', content: '+.terrain-chunk {', newLineNumber: 47 },
					{ type: 'add', content: '+  will-change: transform;', newLineNumber: 48 },
					{ type: 'add', content: '+}', newLineNumber: 49 },
				],
			},
		],
	},
}

export const MOCK_FILE_TREE: FileTreeNode[] = [
	{
		name: 'src',
		path: 'src',
		kind: 'folder',
		children: [
			{
				name: 'game',
				path: 'src/game',
				kind: 'folder',
				children: [
					{
						name: 'World.ts',
						path: 'src/game/World.ts',
						kind: 'file',
						content: `export class World {
  private chunks: Map<string, Chunk> = new Map()
  private seed: number
  private generator: TerrainGenerator

  constructor(seed: number) {
    this.seed = seed
    this.generator = new TerrainGenerator(seed)
  }

  loadChunk(x: number, z: number): void {
    const key = \`\${x},\${z}\`
    if (this.chunks.has(key)) return
    const heights = this.generator.generateChunk(x, z)
    this.chunks.set(key, new Chunk(x, z, heights))
  }
}`,
					},
					{
						name: 'TerrainGenerator.ts',
						path: 'src/game/TerrainGenerator.ts',
						kind: 'file',
						content: `import { PerlinNoise } from "./noise"

export class TerrainGenerator {
  private noise: PerlinNoise

  constructor(seed: number) {
    this.noise = new PerlinNoise(seed)
  }

  generateChunk(x: number, z: number): Float32Array {
    const size = 16 * 16
    const heights = new Float32Array(size)
    // heightmap generation
    return heights
  }
}`,
					},
					{
						name: 'Chunk.ts',
						path: 'src/game/Chunk.ts',
						kind: 'file',
						content: `export class Chunk {
  constructor(
    readonly x: number,
    readonly z: number,
    readonly heights: Float32Array,
  ) {}
}`,
					},
				],
			},
			{
				name: 'styles',
				path: 'src/styles',
				kind: 'folder',
				children: [
					{
						name: 'game.css',
						path: 'src/styles/game.css',
						kind: 'file',
						content: `.world-viewport {
  width: 100%;
  height: 100%;
  background: var(--surface-1);
}

.terrain-chunk {
  will-change: transform;
}`,
					},
				],
			},
			{
				name: 'main.ts',
				path: 'src/main.ts',
				kind: 'file',
				content: `import { World } from "./game/World"

const world = new World(Date.now())
world.loadChunk(0, 0)`,
			},
		],
	},
	{
		name: 'package.json',
		path: 'package.json',
		kind: 'file',
		content: `{
  "name": "unwritten-worlds",
  "version": "0.1.0"
}`,
	},
]

export function getMockDiff(path: string): FileDiff | null {
	return MOCK_DIFFS[path] ?? null
}

export function findMockFileContent(path: string): string | null {
	function search(nodes: FileTreeNode[]): string | null {
		for (const node of nodes) {
			if (node.kind === 'file' && node.path === path) {
				return node.content ?? null
			}
			if (node.children) {
				const found = search(node.children)
				if (found) return found
			}
		}
		return null
	}
	return search(MOCK_FILE_TREE)
}
