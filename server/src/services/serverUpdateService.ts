import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ServerConfig } from '../config.js'
import type { ServerUpdateResult, ServerUpdateStep } from '../types/system.js'
import { runPlatformShell } from '../utils/exec.js'

export class ServerUpdateService {
	constructor(private config: ServerConfig) {}

	async updateAndRestart(): Promise<ServerUpdateResult> {
		const installPath = this.config.installPath
		const steps: ServerUpdateStep[] = []

		try {
			await access(installPath)
		} catch {
			return {
				ok: false,
				restarting: false,
				installPath,
				steps,
				error: `Install path not found: ${installPath}`,
			}
		}

		const gitDir = join(installPath, '.git')
		try {
			await access(gitDir)
		} catch {
			return {
				ok: false,
				restarting: false,
				installPath,
				steps,
				error: 'Install path is not a git repository — set DEV_STUDIO_INSTALL_PATH to your dev-studio clone',
			}
		}

		const runStep = async (name: string, script: string): Promise<boolean> => {
			const result = await runPlatformShell(installPath, script)
			steps.push({
				name,
				exitCode: result.exitCode,
				stdout: tailOutput(result.stdout),
				stderr: tailOutput(result.stderr),
			})
			return result.exitCode === 0
		}

		const branch = this.config.gitBranch
		if (!(await runStep(`git pull origin ${branch}`, `git pull origin ${branch}`))) {
			return {
				ok: false,
				restarting: false,
				installPath,
				steps,
				error: steps.at(-1)?.stderr || 'git pull failed',
			}
		}

		if (process.env.DEV_STUDIO_UPDATE_SKIP_INSTALL !== 'true') {
			if (!(await runStep('npm install', 'npm install'))) {
				return {
					ok: false,
					restarting: false,
					installPath,
					steps,
					error: steps.at(-1)?.stderr || 'npm install failed',
				}
			}
		}

		if (!(await runStep('npm run build:server', 'npm run build:server'))) {
			return {
				ok: false,
				restarting: false,
				installPath,
				steps,
				error: steps.at(-1)?.stderr || 'build failed',
			}
		}

		this.scheduleRestart(installPath)

		return {
			ok: true,
			restarting: true,
			installPath,
			steps,
		}
	}

	private scheduleRestart(installPath: string): void {
		const restartCmd = this.config.restartCommand
		const cwd = resolve(installPath)

		if (process.platform === 'win32') {
			// Pass args separately — quoted "start \"\" /D ..." strings break and Windows looks for "\\"
			spawn('cmd.exe', ['/c', 'start', '/D', cwd, 'cmd', '/k', restartCmd], {
				detached: true,
				stdio: 'ignore',
			}).unref()
		} else {
			spawn('sh', ['-c', `sleep 2 && cd "${cwd}" && ${restartCmd}`], {
				detached: true,
				stdio: 'ignore',
			}).unref()
		}

		setTimeout(() => {
			process.exit(0)
		}, 1500)
	}
}

function tailOutput(text: string, maxLines = 12): string {
	const lines = text.trim().split('\n')
	if (lines.length <= maxLines) return text.trim()
	return lines.slice(-maxLines).join('\n')
}
