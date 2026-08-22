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

function canAccessLocalFilesystem(isTauri, backendUrl) {
	return isTauri || isLocalBackendUrl(backendUrl)
}

test('isLocalBackendUrl: accepts localhost and loopback', () => {
	assert.equal(isLocalBackendUrl('http://localhost:3847'), true)
	assert.equal(isLocalBackendUrl('http://127.0.0.1:3847'), true)
	assert.equal(isLocalBackendUrl('http://[::1]:3847'), true)
})

test('isLocalBackendUrl: rejects remote backends', () => {
	assert.equal(isLocalBackendUrl('https://laptop.tail-xx.ts.net'), false)
	assert.equal(isLocalBackendUrl(''), false)
})

test('canAccessLocalFilesystem: enabled for Tauri or local backend', () => {
	assert.equal(canAccessLocalFilesystem(true, ''), true)
	assert.equal(canAccessLocalFilesystem(false, 'http://localhost:3847'), true)
	assert.equal(canAccessLocalFilesystem(false, 'https://laptop.tail-xx.ts.net'), false)
})
