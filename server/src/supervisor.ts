import { spawn } from 'node:child_process'
import { access, appendFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Written by update-restart; supervisor respawns the server when this file exists. */
export const RESTART_FLAG_NAME = 'RESTART_REQUESTED'
const RESTART_WAIT_MS = 3000

const dataDir = process.env.DEV_STUDIO_DATA_DIR ?? join(homedir(), '.dev-studio')
const flagPath = join(dataDir, RESTART_FLAG_NAME)
const logPath = join(dataDir, 'restart.log')
const serverEntry = join(dirname(fileURLToPath(import.meta.url)), 'index.js')

async function log(message: string): Promise<void> {
	const line = `[${new Date().toISOString()}] ${message}\n`
	try {
		await appendFile(logPath, line)
	} catch {
		// ignore log failures
	}
}

function runServer(): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [serverEntry], {
			stdio: 'inherit',
			env: process.env,
		})
		child.on('exit', (code) => resolve(code ?? 1))
		child.on('error', () => resolve(1))
	})
}

async function restartRequested(): Promise<boolean> {
	try {
		await access(flagPath)
		await unlink(flagPath)
		return true
	} catch {
		return false
	}
}

async function main(): Promise<void> {
	await log(`supervisor started (pid ${process.pid})`)

	while (true) {
		await log(`starting server: ${serverEntry}`)
		const exitCode = await runServer()
		await log(`server exited with code ${exitCode}`)

		if (!(await restartRequested())) {
			process.exit(exitCode)
		}

		await log(`restart flag found, waiting ${RESTART_WAIT_MS}ms`)
		await new Promise((resolve) => setTimeout(resolve, RESTART_WAIT_MS))
	}
}

main().catch(async (err) => {
	await log(`supervisor fatal: ${err instanceof Error ? err.message : String(err)}`)
	console.error(err)
	process.exit(1)
})
