const CACHE = "todo-pwa-v5";
const VERSION = CACHE.replace("todo-pwa-", ""); // "v5"
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Pre-cache the app shell on install
self.addEventListener("install", (event) => {
  // Pre-cache, but do NOT skipWaiting here — the new worker waits until the
  // user taps "업데이트" (page posts "skipWaiting"). First install (no existing
  // controller) still activates immediately.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
});

// Clean up old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Page <-> worker messages
self.addEventListener("message", (event) => {
  // report the running version
  if (event.data === "version" && event.source) {
    event.source.postMessage({ type: "version", version: VERSION });
  }
  // user tapped "업데이트" -> activate this waiting worker now
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});

// Cache-first for app shell, with network fallback + runtime caching
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // cache same-origin successful responses for offline use
          if (res && res.status === 200 && req.url.startsWith(self.location.origin)) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
