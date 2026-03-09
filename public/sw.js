const CACHE_VERSION = "opti-ams-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PDF_CACHE = `${CACHE_VERSION}-pdfs`;

const STATIC_ASSETS = [
  "/index.html",
  "/manifest.json",
  "/firebase.config.js",
  "/css/styles.css",
  "/js/ui.js",
  "/js/calculos.js",
  "/js/db.js",
  "/js/auth.js",
  "/js/firebase.js",
  "/assets/logo-placeholder.svg",
  "/assets/sample-diagrama.pdf"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE, PDF_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (url.pathname.endsWith(".pdf")) {
    event.respondWith(cacheFirst(request, PDF_CACHE));
    return;
  }

  if (url.pathname.includes("/api/") || url.hostname.includes("firestore") || url.hostname.includes("firebase")) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-forms") {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  clients.forEach((client) => {
    client.postMessage({ type: "SYNC_PENDING_FORMS" });
  });
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || networkPromise || Response.error();
}
