const CACHE_NAME = "peixiu-app-shell-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/valhalla.js",
  "/valhalla.wasm",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith(".gph") || url.pathname.startsWith("/routing/")) return;

  const cacheResponse = (response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  };

  const networkFirst = async () => {
    try {
      return cacheResponse(await fetch(request, { cache: "no-store" }));
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw new Error("Network request failed and no cached response is available");
    }
  };

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst());
    return;
  }

  const isAppShellResource = ["document", "script", "style", "font", "image", "manifest"].includes(request.destination)
    || url.pathname.endsWith(".wasm");
  if (!isAppShellResource) return;

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then(cacheResponse)),
  );
});
