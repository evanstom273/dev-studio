import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SETTINGS_DIR = join(homedir(), '.gemini', 'antigravity-cli')
const SETTINGS_PATH = join(SETTINGS_DIR, 'settings.json')

/** Safe read-only commands auto-approved via agy's native permissions.allow rules. */
const READONLY_ALLOW_RULES = [
	'command(Get-Location)',
	'command(pwd)',
	'command(cd)',
	'command(git status)',
	'command(git diff)',
	'command(git log)',
	'command(git branch)',
	'command(git show)',
	'command(git rev-parse)',
	'command(ls)',
	'command(dir)',
	'command(cat)',
	'command(type)',
	'command(find)',
	'command(grep)',
	'command(rg)',
	'command(ripgrep)',
	'command(head)',
	'command(tail)',
	'command(wc)',
	'command(which)',
	'command(where)',
	'command(echo)',
]

type AgySettings = {
	permissions?: {
		allow?: string[]
		deny?: string[]
		ask?: string[]
	}
	trustedWorkspaces?: string[]
}

export class AgyPermissionService {
	private writeLock: Promise<void> = Promise.resolve()

	async init(): Promise<void> {
		await mkdir(SETTINGS_DIR, { recursive: true })
		await this.ensureReadOnlyAllows()
	}

	private async readSettings(): Promise<AgySettings> {
		try {
			return JSON.parse(await readFile(SETTINGS_PATH, 'utf8')) as AgySettings
		} catch {
			return {}
		}
	}

	private async writeSettings(settings: AgySettings): Promise<void> {
		await mkdir(SETTINGS_DIR, { recursive: true })
		await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
	}

	private async mutate(mutator: (settings: AgySettings) => void): Promise<void> {
		this.writeLock = this.writeLock.then(async () => {
			const settings = await this.readSettings()
			mutator(settings)
			await this.writeSettings(settings)
		})
		await this.writeLock
	}

	async ensureReadOnlyAllows(): Promise<void> {
		await this.mutate((settings) => {
			if (!settings.permissions) settings.permissions = {}
			if (!settings.permissions.allow) settings.permissions.allow = []
			for (const rule of READONLY_ALLOW_RULES) {
				if (!settings.permissions.allow.includes(rule)) {
					settings.permissions.allow.push(rule)
				}
			}
		})
	}

	async ensureTrustedWorkspace(workspacePath: string): Promise<void> {
		const normalized = workspacePath.replace(/\\/g, '/')
		await this.mutate((settings) => {
			if (!settings.trustedWorkspaces) settings.trustedWorkspaces = []
			const existing = settings.trustedWorkspaces.map((entry) => entry.replace(/\\/g, '/'))
			if (!existing.includes(normalized)) {
				settings.trustedWorkspaces.push(workspacePath)
			}
		})
	}

	commandAllowRule(command: string): string {
		return `command(${command.trim()})`
	}

	async grantCommand(command: string): Promise<void> {
		const rule = this.commandAllowRule(command)
		await this.mutate((settings) => {
			if (!settings.permissions) settings.permissions = {}
			if (!settings.permissions.allow) settings.permissions.allow = []
			if (!settings.permissions.allow.includes(rule)) {
				settings.permissions.allow.push(rule)
			}
		})
	}

	async grantTool(toolName: string, parameters: Record<string, unknown>): Promise<void> {
		if (toolName.includes('run_command')) {
			const cmd = parameters.CommandLine ?? parameters.command
			if (typeof cmd === 'string' && cmd.trim()) {
				await this.grantCommand(cmd)
			}
		}
	}
}
