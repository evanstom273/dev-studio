import { createConnection } from 'node:net'

const POLL_MS = 500

/** Returns true when nothing is accepting connections on host:port. */
export async function waitForPortFree(
	host: string,
	port: number,
	timeoutMs = 30000,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs

	while (Date.now() < deadline) {
		if (await isPortFree(host, port)) {
			return true
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_MS))
	}

	return false
}

function isPortFree(host: string, port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ host, port })
		const done = (free: boolean) => {
			socket.removeAllListeners()
			socket.destroy()
			resolve(free)
		}

		socket.once('connect', () => done(false))
		socket.once('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH') {
				done(true)
				return
			}
			done(false)
		})
	})
}
