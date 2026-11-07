/* Simple offline-first service worker for Memorial app */
const CACHE = "memorial-ios-v210";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./hebrew-calendar.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          const copy = response.clone();
          if (event.request.method === "GET" && response.status === 200) {
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }).catch(() => cached)
      );
    })
  );
});
