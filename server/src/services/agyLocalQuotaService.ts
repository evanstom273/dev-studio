import https from 'node:https'
import { parseQuotaGroups, hasUsableQuotaGroups } from './agyQuotaParse.js'
import type { AgyQuotaSnapshot } from '../types/system.js'
import { runPlatformShell } from '../utils/exec.js'

const LOCAL_METHODS = [
	'RetrieveUserQuotaSummary',
	'GetUserStatus',
] as const

async function getAgyProcessIds(): Promise<string[]> {
	if (process.platform === 'win32') {
		const result = await runPlatformShell('', 'tasklist /FI "IMAGENAME eq agy.exe" /FO CSV /NH')
		const pids: string[] = []
		for (const line of result.stdout.split('\n')) {
			const match = line.match(/"agy\.exe","(\d+)"/i)
			if (match?.[1]) pids.push(match[1])
		}
		return pids
	}

	const result = await runPlatformShell('', 'pgrep -x agy || true')
	return result.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
}

async function getListenPortsForPids(pids: string[]): Promise<number[]> {
	if (!pids.length) return []

	if (process.platform === 'win32') {
		const result = await runPlatformShell('', 'netstat -ano -p tcp')
		const ports = new Set<number>()
		for (const line of result.stdout.split('\n')) {
			if (!/LISTENING/i.test(line)) continue
			const parts = line.trim().split(/\s+/)
			if (parts.length < 5) continue
			const pid = parts.at(-1)
			if (!pid || !pids.includes(pid)) continue
			const localAddress = parts[1] ?? ''
			const portMatch = localAddress.match(/:(\d+)$/)
			if (portMatch?.[1]) ports.add(Number.parseInt(portMatch[1], 10))
		}
		return [...ports]
	}

	const ports = new Set<number>()
	for (const pid of pids) {
		const result = await runPlatformShell('', `lsof -nP -a -p ${pid} -iTCP -sTCP:LISTEN 2>/dev/null || true`)
		for (const line of result.stdout.split('\n')) {
			const match = line.match(/:(\d+)\s+\(LISTEN\)/)
			if (match?.[1]) ports.add(Number.parseInt(match[1], 10))
		}
	}
	return [...ports]
}

function postLocalRpc(port: number, method: string, body: Record<string, unknown>): Promise<unknown> {
	const payload = JSON.stringify(body)

	return new Promise((resolve, reject) => {
		const request = https.request(
			{
				hostname: '127.0.0.1',
				port,
				path: `/exa.language_server_pb.LanguageServerService/${method}`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Connect-Protocol-Version': '1',
					'Content-Length': Buffer.byteLength(payload),
				},
				rejectUnauthorized: false,
				timeout: 8000,
			},
			(response) => {
				let text = ''
				response.on('data', (chunk: Buffer) => {
					text += chunk.toString()
				})
				response.on('end', () => {
					if ((response.statusCode ?? 500) >= 400) {
						reject(new Error(`${method} -> HTTP ${response.statusCode}: ${text.slice(0, 200)}`))
						return
					}
					try {
						resolve(text ? JSON.parse(text) : {})
					} catch {
						reject(new Error(`${method} returned non-JSON response`))
					}
				})
			},
		)

		request.on('timeout', () => {
			request.destroy(new Error(`${method} timed out on port ${port}`))
		})
		request.on('error', reject)
		request.write(payload)
		request.end()
	})
}

export async function fetchLocalAgyQuota(): Promise<AgyQuotaSnapshot | null> {
	const pids = await getAgyProcessIds()
	const ports = await getListenPortsForPids(pids)
	if (!ports.length) return null

	const nowMs = Date.now()
	let lastError: Error | null = null

	for (const port of ports) {
		for (const method of LOCAL_METHODS) {
			try {
				const raw = await postLocalRpc(port, method, {})
				const groups = parseQuotaGroups(raw, nowMs)
				if (!hasUsableQuotaGroups(groups)) continue

				return {
					account: null,
					tier: null,
					fetchedAt: new Date(nowMs).toISOString(),
					source: 'local',
					host: `127.0.0.1:${port}`,
					note: method,
					groups,
				}
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))
			}
		}
	}

	if (lastError) {
		throw lastError
	}

	return null
}
