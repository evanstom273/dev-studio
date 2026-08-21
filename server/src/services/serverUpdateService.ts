import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ServerConfig } from '../config.js'
import type { ServerUpdateResult, ServerUpdateStep } from '../types/system.js'
import { runPlatformShell } from '../utils/exec.js'

/** Seconds to wait in restart.bat before binding the port (old process must exit first). */
const RESTART_DELAY_SEC = 4

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

		const restartLogPath = await this.scheduleRestart(installPath)

		return {
			ok: true,
			restarting: true,
			installPath,
			steps,
			restartLogPath,
		}
	}

	private async scheduleRestart(installPath: string): Promise<string> {
		const cwd = resolve(installPath)
		const restartCmd = this.config.restartCommand
		const scriptDir = join(this.config.dataDir, 'scripts')
		const batPath = join(scriptDir, 'restart-server.bat')
		const logPath = join(this.config.dataDir, 'restart.log')

		await mkdir(scriptDir, { recursive: true })
		await writeFile(batPath, buildRestartBat(cwd, restartCmd, logPath), 'utf8')

		if (process.platform === 'win32') {
			spawnWindowsRestart(batPath, cwd)
		} else {
			spawn('sh', ['-c', `sleep ${RESTART_DELAY_SEC} && "${batPath}" >> "${logPath}" 2>&1`], {
				detached: true,
				stdio: 'ignore',
			}).unref()
		}

		// Exit quickly; restart.bat waits before binding the port.
		setTimeout(() => {
			process.exit(0)
		}, 800)

		return logPath
	}
}

function buildRestartBat(cwd: string, restartCmd: string, logPath: string): string {
	const log = batQuote(logPath)
	const lines = [
		'@echo off',
		'setlocal',
		`cd /d ${batQuote(cwd)}`,
		`set ${batAssign('DEV_STUDIO_INSTALL_PATH', cwd)}`,
		`set ${batAssign('DEV_STUDIO_RESTART_COMMAND', restartCmd)}`,
	]

	for (const [key, value] of Object.entries(process.env)) {
		if (!value) continue
		if (key.startsWith('DEV_STUDIO_') && key !== 'DEV_STUDIO_INSTALL_PATH' && key !== 'DEV_STUDIO_RESTART_COMMAND') {
			lines.push(`set ${batAssign(key, value)}`)
		}
	}

	if (process.env.AGY_PATH) {
		lines.push(`set ${batAssign('AGY_PATH', process.env.AGY_PATH)}`)
	}

	lines.push(
		`echo [%date% %time%] waiting ${RESTART_DELAY_SEC}s for old server to exit >> ${log}`,
		`timeout /t ${RESTART_DELAY_SEC} /nobreak >nul`,
		`echo [%date% %time%] starting: ${restartCmd} >> ${log}`,
		`call ${restartCmd} >> ${log} 2>&1`,
		`echo [%date% %time%] server exited with code %errorlevel% >> ${log}`,
		'endlocal',
		'',
	)

	return lines.join('\r\n')
}

/** Spawn restart via PowerShell Start-Process so it survives after this Node process exits. */
function spawnWindowsRestart(batPath: string, cwd: string): void {
	const batArg = batPath.replace(/'/g, "''")
	const cwdArg = cwd.replace(/'/g, "''")
	const ps = [
		'Start-Process',
		"-FilePath 'cmd.exe'",
		`-ArgumentList '/c','${batArg}'`,
		'-WindowStyle Hidden',
		`-WorkingDirectory '${cwdArg}'`,
	].join(' ')

	spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
		detached: true,
		stdio: 'ignore',
		windowsHide: true,
	}).unref()
}

function batQuote(value: string): string {
	return `"${value.replace(/"/g, '""')}"`
}

function batAssign(name: string, value: string): string {
	return `"${name}=${value.replace(/"/g, '""')}"`
}

function tailOutput(text: string, maxLines = 12): string {
	const lines = text.trim().split('\n')
	if (lines.length <= maxLines) return text.trim()
	return lines.slice(-maxLines).join('\n')
}
