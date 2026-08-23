import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const codexJs = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')

function buildCodexExecArgs(options) {
	const args = []
	const isResume = Boolean(options.threadId)

	if (isResume) {
		args.push('exec', 'resume', options.threadId, '--json', '--skip-git-repo-check')
	} else {
		args.push('exec', '--json', '--skip-git-repo-check')
	}

	const isAgent = options.mode === 'agent'
	const sandboxMode = isAgent ? 'workspace-write' : 'read-only'
	const autoApproveAgent = Boolean(options.autoApprove && isAgent)
	const useApproveForMe = autoApproveAgent && !isResume

	if (options.autoApprove) {
		if (isAgent) {
			if (isResume) {
				args.push('--dangerously-bypass-approvals-and-sandbox')
			} else {
				args.push('--approve-for-me')
			}
		} else {
			args.push('-c', 'approval_policy="never"')
		}
	}

	args.push('-c', 'agents.enabled=true')

	if (isAgent) {
		args.push('-c', 'sandbox_workspace_write.network_access=true')
	}

	if (options.model) {
		const cleanModel = options.model.replace(/^(codex|openai):/, '')
		args.push('-m', cleanModel)
	}

	if (options.reasoningEffort) {
		args.push('-c', `model_reasoning_effort="${options.reasoningEffort}"`)
	}

	if (options.speed && options.speed !== 'default') {
		args.push('-c', `service_tier="${options.speed}"`)
	}

	if (isResume) {
		if (!autoApproveAgent) {
			args.push('-c', `sandbox_mode="${sandboxMode}"`)
		}
	} else if (!useApproveForMe) {
		args.push('-s', sandboxMode)
	}

	args.push('-')
	return args
}

function assertNoApproveForMeSandboxConflict(args) {
	const hasApproveForMe = args.includes('--approve-for-me')
	const hasSandboxFlag = args.includes('-s') || args.some((arg) => arg.includes('sandbox_mode='))
	assert.equal(
		hasApproveForMe && hasSandboxFlag,
		false,
		`--approve-for-me cannot be combined with sandbox flags: ${JSON.stringify(args)}`,
	)
}

function codexCliAcceptsArgs(args) {
	const result = spawnSync(process.execPath, [codexJs, ...args], {
		input: '',
		encoding: 'utf8',
		timeout: 3000,
	})
	const combined = `${result.stdout}\n${result.stderr}`
	assert.doesNotMatch(combined, /cannot be used with.*sandbox/i)
	assert.doesNotMatch(combined, /unexpected argument/i)
}

const MODELS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']
const EFFORTS = ['low', 'medium', 'high', 'xhigh']

for (const model of MODELS) {
	for (const effort of EFFORTS) {
		test(`codex CLI accepts auto-approve new session args for ${model} @ ${effort}`, () => {
			const args = buildCodexExecArgs({
				threadId: null,
				mode: 'agent',
				autoApprove: true,
				model,
				reasoningEffort: effort,
			})
			assertNoApproveForMeSandboxConflict(args)
			codexCliAcceptsArgs(args)
		})
	}
}

test('codex CLI accepts auto-approve resumed session args for luna high', () => {
	const args = buildCodexExecArgs({
		threadId: 'thread-123',
		mode: 'agent',
		autoApprove: true,
		model: 'gpt-5.6-luna',
		reasoningEffort: 'high',
	})
	assert.ok(args.includes('--dangerously-bypass-approvals-and-sandbox'))
	assert.ok(!args.includes('--approve-for-me'))
	assert.ok(!args.some((arg) => arg.includes('sandbox_mode=')))
	codexCliAcceptsArgs(args)
})
