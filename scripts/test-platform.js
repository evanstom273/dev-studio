import test from 'node:test'
import assert from 'node:assert/strict'

function isLocalBackendUrl(url) {
	if (!url.trim()) return false
	try {
		const parsed = new URL(url)
		const host = parsed.hostname.toLowerCase()
		return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
	} catch {
		return false
	}
}

function canOpenLocalFolder(connected, backendUrl) {
	return connected && Boolean(backendUrl.trim())
}

test('isLocalBackendUrl: accepts localhost and loopback', () => {
	assert.equal(isLocalBackendUrl('http://localhost:3847'), true)
	assert.equal(isLocalBackendUrl('http://127.0.0.1:3847'), true)
	assert.equal(isLocalBackendUrl('http://[::1]:3847'), true)
})

test('isLocalBackendUrl: rejects empty url', () => {
	assert.equal(isLocalBackendUrl(''), false)
})

test('canOpenLocalFolder: enabled whenever laptop backend is connected', () => {
	assert.equal(canOpenLocalFolder(true, 'http://localhost:3847'), true)
	assert.equal(canOpenLocalFolder(true, 'https://laptop.tail-xx.ts.net'), true)
	assert.equal(canOpenLocalFolder(false, 'http://localhost:3847'), false)
	assert.equal(canOpenLocalFolder(true, ''), false)
})
