const CACHE_NAME = "birthday-bingo-v1-shell-v1";
const APP_SHELL = [
	"./",
	"./index.html",
	"./manifest.json",
	"./favicon.ico",
	"./favicon-16x16.png",
	"./favicon-32x32.png",
	"./apple-touch-icon.png",
	"./android-chrome-192x192.png",
	"./android-chrome-512x512.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== CACHE_NAME)
						.map((key) => caches.delete(key)),
				),
			),
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;
	const url = new URL(event.request.url);
	const isAppAsset =
		url.origin === self.location.origin &&
		(url.pathname.endsWith("/") ||
			url.pathname.endsWith("/index.html") ||
			url.pathname.endsWith("/app.js") ||
			url.pathname.endsWith("/app.css"));
	if (isAppAsset) {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					const copy = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						void cache.put(event.request, copy);
					});
					return response;
				})
				.catch(() =>
					caches
						.match(event.request)
						.then((cached) => cached ?? Response.error()),
				),
		);
		return;
	}
	// Everything else (icons, and importantly the encrypted game content
	// JSON under ./games/encrypted/) is cache-first with network fallback,
	// so a returning player can reload offline once the PWA has been
	// opened at least once with connectivity.
	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) return cached;
			return fetch(event.request).then((response) => {
				const copy = response.clone();
				caches.open(CACHE_NAME).then((cache) => {
					void cache.put(event.request, copy);
				});
				return response;
			});
		}),
	);
});
