export type ServerUpdateStep = {
	name: string
	exitCode: number
	stdout: string
	stderr: string
}

export type ServerUpdateResult = {
	ok: boolean
	restarting: boolean
	installPath: string
	steps: ServerUpdateStep[]
	error?: string
}
