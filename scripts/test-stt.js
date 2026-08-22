import test from 'node:test'
import assert from 'node:assert/strict'

function mergeTranscriptParts(committed, extension) {
	const left = committed.trim()
	const right = extension.trim()
	if (!left) return right
	if (!right) return left
	if (left === right) return left
	if (left.endsWith(right)) return left
	if (right.startsWith(left)) return right

	const leftWords = left.split(/\s+/).filter(Boolean)
	const rightWords = right.split(/\s+/).filter(Boolean)
	const maxOverlap = Math.min(leftWords.length, rightWords.length)

	for (let overlap = maxOverlap; overlap > 0; overlap--) {
		const suffix = leftWords.slice(-overlap).join(' ')
		const prefix = rightWords.slice(0, overlap).join(' ')
		if (suffix === prefix) {
			return [...leftWords, ...rightWords.slice(overlap)].join(' ')
		}
	}

	return `${left} ${right}`
}

function composeSessionTranscript(cumulative, subsessionCommitted, interim) {
	let session = cumulative.trim()
	const committed = subsessionCommitted.trim()
	const pending = interim.trim()

	if (committed) {
		session = mergeTranscriptParts(session, committed)
	}
	if (pending) {
		session = mergeTranscriptParts(session, pending)
	}

	return session.replace(/\s+/g, ' ').trim()
}

test('mergeTranscriptParts avoids duplicate suffix overlap', () => {
	assert.equal(mergeTranscriptParts('is this', 'this working'), 'is this working')
	assert.equal(mergeTranscriptParts('is', 'is this working'), 'is this working')
	assert.equal(mergeTranscriptParts('is this working', 'working now'), 'is this working now')
})

test('mergeTranscriptParts keeps distinct phrases separate', () => {
	assert.equal(mergeTranscriptParts('hello', 'world'), 'hello world')
	assert.equal(mergeTranscriptParts('', 'is this working'), 'is this working')
})

test('composeSessionTranscript matches live dictation progression', () => {
	let cumulative = ''
	let subsession = ''
	let interim = 'is'

	assert.equal(composeSessionTranscript(cumulative, subsession, interim), 'is')

	subsession = 'is'
	interim = 'is this'
	assert.equal(composeSessionTranscript(cumulative, subsession, interim), 'is this')

	subsession = 'is this'
	interim = 'working'
	assert.equal(composeSessionTranscript(cumulative, subsession, interim), 'is this working')

	subsession = 'is this working'
	interim = ''
	assert.equal(composeSessionTranscript(cumulative, subsession, interim), 'is this working')
})

test('composeSessionTranscript accumulates across subsessions', () => {
	const cumulative = 'is this working'
	const subsession = 'now'
	const interim = ''
	assert.equal(composeSessionTranscript(cumulative, subsession, interim), 'is this working now')
})
