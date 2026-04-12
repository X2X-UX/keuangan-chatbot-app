const STATIC_CACHE = "arunika-static-v4";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/transaction-categories.js",
  "/transaction-amount.js",
  "/manifest.webmanifest",
  "/icons/arunika-mark.svg",
  "/icons/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/shortcut-scan-96.png",
  "/icons/shortcut-manual-96.png",
  "/offline.html"
];

const NETWORK_FIRST_ASSETS = new Set([
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/transaction-categories.js",
  "/transaction-amount.js"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE) {
            return caches.delete(key);
          }

          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return cache.match("/offline.html");
      })
    );
    return;
  }

  event.respondWith(
    (async () => {
      if (NETWORK_FIRST_ASSETS.has(url.pathname)) {
        try {
          const freshResponse = await fetch(event.request);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(event.request, freshResponse.clone());
          return freshResponse;
        } catch {
          const cached = await caches.match(event.request);
          if (cached) {
            return cached;
          }

          throw new Error("Network request failed.");
        }
      }

      const cached = await caches.match(event.request);
      if (cached) {
        return cached;
      }

      return fetch(event.request);
    })()
  );
});
