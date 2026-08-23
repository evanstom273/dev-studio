import test from 'node:test'
import assert from 'node:assert/strict'
import {
	createRunningActivityFromCodexItem,
	finalizeActivityFromCodexItem,
	isCodexToolActivityItemType,
} from '../server/dist/services/agent/codexItemParser.js'

test('isCodexToolActivityItemType includes collab_tool_call', () => {
	assert.equal(isCodexToolActivityItemType('collab_tool_call'), true)
	assert.equal(isCodexToolActivityItemType('command_execution'), true)
	assert.equal(isCodexToolActivityItemType('agent_message'), false)
})

test('createRunningActivityFromCodexItem: spawn_agent collab item', () => {
	const activity = createRunningActivityFromCodexItem(
		{
			id: 'item_0',
			type: 'collab_tool_call',
			tool: 'spawn_agent',
			status: 'in_progress',
			prompt: 'Refactor auth module tests',
			sender_thread_id: 'thread-parent',
			receiver_thread_ids: [],
			agents_states: {},
		},
		'agent',
	)

	assert.ok(activity)
	assert.equal(activity.type, 'subagent')
	assert.equal(activity.status, 'running')
	assert.equal(activity.toolName, 'spawn_agent')
	assert.match(activity.title, /Spawn subagent/i)
	assert.match(activity.title, /Refactor auth module tests/)
})

test('finalizeActivityFromCodexItem: completed spawn_agent with child thread', () => {
	const started = createRunningActivityFromCodexItem(
		{
			id: 'item_0',
			type: 'collab_tool_call',
			tool: 'spawn_agent',
			status: 'in_progress',
			prompt: 'Audit API routes',
			sender_thread_id: 'thread-parent',
			receiver_thread_ids: [],
			agents_states: {},
		},
		'agent',
	)

	const completed = finalizeActivityFromCodexItem(
		started ?? undefined,
		{
			id: 'item_0',
			type: 'collab_tool_call',
			tool: 'spawn_agent',
			status: 'completed',
			prompt: 'Audit API routes',
			sender_thread_id: 'thread-parent',
			receiver_thread_ids: ['thread-child-abc'],
			agents_states: {
				'thread-child-abc': { status: 'running', message: null },
			},
		},
		'agent',
	)

	assert.ok(completed)
	assert.equal(completed.status, 'completed')
	assert.equal(completed.detail?.receiverThreadIds?.[0], 'thread-child-abc')
	assert.equal(completed.detail?.agentStates?.['thread-child-abc']?.status, 'running')
	assert.match(completed.title, /1 active/)
})

test('collab_tool_call ignored outside agent mode', () => {
	const activity = createRunningActivityFromCodexItem(
		{
			id: 'item_1',
			type: 'collab_tool_call',
			tool: 'spawn_agent',
			status: 'in_progress',
		},
		'ask',
	)
	assert.equal(activity, null)
})

test('finalizeActivityFromCodexItem: wait collab item', () => {
	const completed = finalizeActivityFromCodexItem(
		undefined,
		{
			id: 'item_2',
			type: 'collab_tool_call',
			tool: 'wait',
			status: 'completed',
			sender_thread_id: 'thread-parent',
			receiver_thread_ids: ['thread-a', 'thread-b'],
			agents_states: {
				'thread-a': { status: 'completed' },
				'thread-b': { status: 'completed' },
			},
		},
		'agent',
	)

	assert.ok(completed)
	assert.equal(completed.toolName, 'wait')
	assert.match(completed.title, /Subagents finished|ready/i)
})
