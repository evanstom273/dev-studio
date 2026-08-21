import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { ToolStatus } from '../types/agent.js'

const execFileAsync = promisify(execFile)

export async function checkCommand(path: string, versionArgs: string[] = ['--version']): Promise<ToolStatus> {
	try {
		const { stdout } = await execFileAsync(path, versionArgs, { timeout: 5000 })
		return {
			available: true,
			path,
			version: stdout.trim().split('\n')[0],
		}
	} catch (error) {
		return {
			available: false,
			path,
			message: error instanceof Error ? error.message : 'Command not found',
		}
	}
}

export async function checkAgyAuth(agyPath: string): Promise<ToolStatus> {
	const base = await checkCommand(agyPath)
	if (!base.available) return base

	try {
		await execFileAsync(agyPath, ['-p', 'ping', '--output-format', 'json'], {
			timeout: 15000,
			env: { ...process.env },
		})
		return { ...base, authenticated: true }
	} catch (error) {
		const msg = error instanceof Error ? error.message : 'Unknown error'
		const needsAuth = msg.includes('authentication') || msg.includes('auth')
		return {
			...base,
			authenticated: !needsAuth,
			message: needsAuth ? 'Run: agy (sign in with Google account)' : msg.slice(0, 200),
		}
	}
}

export function runCommand(
	cwd: string,
	command: string,
	args: string[],
	onStdout?: (chunk: string) => void,
	onStderr?: (chunk: string) => void,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd,
			env: process.env,
			shell: false,
		})

		let stdout = ''
		let stderr = ''

		child.stdout.on('data', (data: Buffer) => {
			const chunk = data.toString()
			stdout += chunk
			onStdout?.(chunk)
		})

		child.stderr.on('data', (data: Buffer) => {
			const chunk = data.toString()
			stderr += chunk
			onStderr?.(chunk)
		})

		child.on('close', (code) => {
			resolve({ exitCode: code ?? 1, stdout, stderr })
		})

		child.on('error', (err) => {
			resolve({ exitCode: 1, stdout, stderr: err.message })
		})
	})
}

export async function runShell(
	cwd: string,
	script: string,
	timeoutMs = 120000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync('bash', ['-lc', script], {
			cwd,
			timeout: timeoutMs,
			maxBuffer: 10 * 1024 * 1024,
		})
		return { exitCode: 0, stdout, stderr }
	} catch (error) {
		const err = error as { code?: number; stdout?: string; stderr?: string; message?: string }
		return {
			exitCode: typeof err.code === 'number' ? err.code : 1,
			stdout: err.stdout ?? '',
			stderr: err.stderr ?? err.message ?? 'Command failed',
		}
	}
}
