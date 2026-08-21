const CACHE_NAME = 'dev-studio-v1'
const PRECACHE_ASSETS = [
	'./',
	'./index.html',
	'./manifest.webmanifest',
	'./favicon.svg',
	'./icon-192.png',
	'./icon-512.png',
	'./apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE_ASSETS))
			.then(() => self.skipWaiting()),
	)
})

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
				),
			)
			.then(() => self.clients.claim()),
	)
})

self.addEventListener('fetch', (event) => {
	const request = event.request

	// Bypass non-GET requests and API calls
	if (request.method !== 'GET' || request.url.includes('/api/')) {
		return
	}

	// HTML navigation requests: Network first, fall back to cached index.html
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then((response) => {
					if (response.ok) {
						const clone = response.clone()
						caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
					}
					return response
				})
				.catch(async () => {
					const cached = await caches.match(request)
					return cached || (await caches.match('./index.html'))
				}),
		)
		return
	}

	// Static assets (CSS, JS, images, fonts): Stale-while-revalidate
	event.respondWith(
		caches.match(request).then((cachedResponse) => {
			const fetchPromise = fetch(request)
				.then((networkResponse) => {
					if (networkResponse && networkResponse.status === 200) {
						const clone = networkResponse.clone()
						caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
					}
					return networkResponse
				})
				.catch(() => cachedResponse)

			return cachedResponse || fetchPromise
		}),
	)
})
