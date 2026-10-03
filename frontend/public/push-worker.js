const CACHE = "amirlab-offline-v1";
const STATIC = ["/offline.html", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then(async (keys) => {
    await Promise.all(keys.filter((key) => key.startsWith("amirlab-offline-") && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  }));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "GET" && url.origin === self.location.origin && !url.search && STATIC.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => await cache.match(url.pathname) || fetch(event.request)));
    return;
  }
  if (event.request.method !== "GET" || event.request.mode !== "navigate" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.searchParams.has("_rsc")) return;
  event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then((cache) => cache.match("/offline.html"))));
});
function workspaceUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/workspace", self.location.origin);
    if (url.origin === self.location.origin && (url.pathname === "/workspace" || url.pathname.startsWith("/workspace/"))) return url.pathname + url.search + url.hash;
  } catch { /* Invalid destinations open the workspace overview. */ }
  return "/workspace";
}
self.addEventListener("push", (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { /* Fall back to generic copy. */ }
  event.waitUntil(self.registration.showNotification("AmirLab", {
    body: "You have a new workspace update.",
    icon: "/icon-192.png",
    data: { url: workspaceUrl(payload?.url) },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(workspaceUrl(event.notification.data?.url)));
});
