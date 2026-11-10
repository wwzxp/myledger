/* 我的账本 PWA service worker。
 *
 * 策略：
 * - 只缓存静态资源（HTML/CSS/JS/图标）；API 一律走网络，避免读到过期账本。
 * - 静态资源改为「网络优先、失败回落缓存」：这个应用离线时本来也查不了账，
 *   而缓存优先会让一次部署停留在旧脚本上，出现「新页面 + 旧 JS」的半坏状态。
 * - 缓存名带版本号，激活时清理旧版本。
 * - 导航请求网络优先，失败回落缓存的 index.html（离线壳）。
 */

const CACHE_VERSION = "myledger-v2";
/* 只预缓存不带版本号的稳定地址；带 ?v= 的资源由页面自己请求并顺带写入缓存，
   避免这里再抄一份版本号，抄错就又是一次「新页面配旧脚本」。 */
const PRECACHE = ["/", "/static/manifest.json", "/static/icon-192.png", "/static/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // 单个资源失败不应让整个安装失败
      Promise.allSettled(PRECACHE.map((url) => cache.add(url))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API 永远走网络，不缓存
  if (url.pathname.startsWith("/api/")) return;

  // 页面导航：网络优先，失败回落缓存的壳，并把最新的壳写回缓存
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || caches.match(request))),
    );
    return;
  }

  // 静态资源：网络优先，失败才用缓存；成功后顺手更新缓存
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
  }
});
