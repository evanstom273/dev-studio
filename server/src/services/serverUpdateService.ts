import { access, appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ServerConfig } from '../config.js'
import { RESTART_FLAG_NAME } from '../restart.js'
import type { ServerUpdateResult, ServerUpdateStep } from '../types/system.js'
import { runPlatformShell } from '../utils/exec.js'

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
				error: 'Invalid install path - set DEV_STUDIO_INSTALL_PATH to your dev-studio clone',
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
				error: 'Install path is not a git repository - set DEV_STUDIO_INSTALL_PATH to your dev-studio clone',
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
		// Discard any local modifications to lockfile before pulling
		await runPlatformShell(installPath, 'git checkout -- package-lock.json').catch(() => null)

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

		const restartLogPath = await this.scheduleRestart()

		return {
			ok: true,
			restarting: true,
			installPath,
			steps,
			restartLogPath,
		}
	}

	/** Signal the running supervisor to restart - no bat/spawn. */
	private async scheduleRestart(): Promise<string> {
		const logPath = join(this.config.dataDir, 'restart.log')
		const flagPath = join(this.config.dataDir, RESTART_FLAG_NAME)

		await mkdir(this.config.dataDir, { recursive: true })
		await appendFile(
			logPath,
			`[${new Date().toISOString()}] update complete, requesting restart (pid ${process.pid})\n`,
		)
		await writeFile(flagPath, new Date().toISOString(), 'utf8')

		setTimeout(() => {
			process.exit(0)
		}, 500)

		return logPath
	}
}

function tailOutput(text: string, maxLines = 12): string {
	const lines = text.trim().split('\n')
	if (lines.length <= maxLines) return text.trim()
	return lines.slice(-maxLines).join('\n')
}
