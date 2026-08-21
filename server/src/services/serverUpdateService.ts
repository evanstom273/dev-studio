import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ServerConfig } from '../config.js'
import type { ServerUpdateResult, ServerUpdateStep } from '../types/system.js'
import { runPlatformShell } from '../utils/exec.js'

/** Windows: spawn a new console when detached with stdio ignored. */

export class ServerUpdateService {
	constructor(private config: ServerConfig) {}

	async updateAndRestart(): Promise<ServerUpdateResult> {
		const installPath = resolve(this.config.installPath)
		const steps: ServerUpdateStep[] = []

		if (!installPath || installPath === '\\') {
			return {
				ok: false,
				restarting: false,
				installPath,
				steps,
				error: 'Invalid install path — set DEV_STUDIO_INSTALL_PATH to your dev-studio clone',
			}
		}

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

		await this.scheduleRestart(installPath)

		return {
			ok: true,
			restarting: true,
			installPath,
			steps,
		}
	}

	private async scheduleRestart(installPath: string): Promise<void> {
		const cwd = resolve(installPath)
		const restartCmd = this.config.restartCommand
		const scriptDir = join(this.config.dataDir, 'scripts')
		const batPath = join(scriptDir, 'restart-server.bat')

		await mkdir(scriptDir, { recursive: true })
		await writeFile(
			batPath,
			[
				'@echo off',
				'title Dev Studio Server',
				`cd /d "${cwd.replace(/"/g, '""')}"`,
				restartCmd,
				'',
			].join('\r\n'),
			'utf8',
		)

		if (process.platform === 'win32') {
			spawn('cmd.exe', ['/k', batPath], {
				detached: true,
				stdio: 'ignore',
				windowsHide: false,
			}).unref()
		} else {
			spawn('sh', ['-c', `sleep 2 && "${batPath}"`], {
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
