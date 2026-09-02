const CACHE_NAME = "birthday-bingo-v1-shell-v2";
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
	if (url.origin !== self.location.origin) return;

	// Network-first: the app shell (must always run the latest deployed
	// code) AND game content under ./games/encrypted/ (must always reflect
	// the latest re-encrypted content -- a party's roster/tasks can change
	// between visits, and cache-first would silently pin a stale copy
	// forever with no way for a returning player to see the fix short of
	// clearing site data). Falls back to cache only when the network fails,
	// so a previously-loaded game still works offline.
	const isNetworkFirst =
		url.pathname.endsWith("/") ||
		url.pathname.endsWith("/index.html") ||
		url.pathname.endsWith("/app.js") ||
		url.pathname.endsWith("/app.css") ||
		url.pathname.includes("/games/encrypted/");
	if (isNetworkFirst) {
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

	// Everything else (favicons/manifest -- static, effectively immutable
	// per deploy) is cache-first with network fallback.
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
