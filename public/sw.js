const CACHE_VERSION = "opti-ams-v11";
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
  "/assets/icono.png",
  "/assets/header.png",
  "/assets/sample-diagrama.pdf",
  "/vendor/localforage.min.js",
  "/vendor/xlsx.full.min.js",
  "/vendor/chart.umd.min.js",
  "/vendor/jspdf.umd.min.js",
  "/vendor/jspdf.plugin.autotable.min.js",
  "/vendor/lucide.min.js",
  "/vendor/jquery-3.7.1.min.js",
  "/vendor/jquery.dataTables.min.js",
  "/vendor/dataTables.responsive.min.js",
  "/vendor/dataTables.buttons.min.js",
  "/vendor/buttons.colVis.min.js",
  "/vendor/buttons.html5.min.js",
  "/vendor/buttons.print.min.js",
  "/vendor/jszip.min.js",
  "/vendor/pdfmake.min.js",
  "/vendor/vfs_fonts.js",
  "/vendor/firebase-app-compat.js",
  "/vendor/firebase-firestore-compat.js",
  "/vendor/firebase-storage-compat.js",
  "/vendor/jquery.dataTables.min.css",
  "/vendor/buttons.dataTables.min.css",
  "/vendor/responsive.dataTables.min.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const staticCache = await caches.open(STATIC_CACHE);
    await staticCache.addAll(STATIC_ASSETS);
  })());
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
      networkFirstWithFallback(request, "/index.html")
    );
    return;
  }

  if (url.origin === self.location.origin && STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
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

async function networkFirstWithFallback(request, fallbackPath) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    const fallback = await caches.match(fallbackPath);
    if (fallback) {
      return fallback;
    }
    return Response.error();
  }
}
