/*
 * 心屿 Service Worker —— 离线能力（应用外壳 + 已访问资源 + 历史回退）
 *
 * 策略总览：
 *   - 导航请求 (navigate)   → network-first，离线回退到缓存的应用外壳，再回退到 offline.html
 *   - /api/ 的 GET 请求      → network-first，离线回退到上次成功的缓存（用于离线查看历史/岛屿状态）
 *   - 同源静态资源/3D/音频    → stale-while-revalidate（首次访问后即可离线复用，按需缓存，不全量预缓存）
 *   - 跨源字体 (Google Fonts) → stale-while-revalidate
 *   - 其它 / 非 GET / WS      → 直接走网络
 *
 * 升级缓存策略、**或当同 URL 资源(模型/音频/场景)内容变化时(如重导出 .glb)**，请提升 VERSION：
 * activate 时会清掉旧 VERSION 的全部缓存，强制重新拉取新内容。否则同名资源会被 stale-while-revalidate
 * 先喂旧缓存(本次访问拿到旧版，下次才更新)——曾导致重导出带 WalkLoop 动画的主角 glb 后「网站走路动作没了」。
 * 注:js/css 走内容哈希文件名(改了即换 URL，自然刷新)，无需为它们提升 VERSION；只有固定 URL 的资源需要。
 */
const VERSION = "xinyu-v4";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const API_CACHE = `${VERSION}-api`;
const FONT_CACHE = `${VERSION}-fonts`;

// 应用外壳：保证断网也能把界面骨架渲染出来
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/mobile.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/manifest.mobile.webmanifest",
  "/favicon.svg",
  "/icon.svg",
  "/noise.svg",
  "/pwa-192.png",
  "/pwa-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // 逐个添加：个别资源缺失（如某图标未发布）不应让整个安装失败
      await Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, RUNTIME_CACHE, API_CACHE, FONT_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

// 允许页面主动触发立即生效
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  if (/\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|ico|glb|gltf|bin|mp3|m4a|ogg|wav|json)$/i.test(url.pathname)) {
    return true;
  }
  return /^\/(?:assets|models|audio|scenes)\//.test(url.pathname);
}

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallback) {
      const fb = await caches.match(fallback);
      if (fb) return fb;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  // 网络取用 cache:"no-cache"=带 ETag/Last-Modified 条件请求,绕过浏览器 HTTP 缓存的「同 URL 旧内容」:
  // 模型/音频是固定 URL、内容可随重导出变化,若走默认缓存(max-age 7天)会一直拿旧文件;
  // 条件请求让服务器在内容变了时返 200 新文件、没变返 304(便宜)。这样 SW 缓存始终跟随服务器真实内容。
  const network = fetch(request, { cache: "no-cache" })
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // 写操作（POST/DELETE）一律走网络
  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return; // 跳过 ws/wss 等

  // 页面导航：离线时回退到应用外壳
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        // 移动端入口(/mobile.html 或 /m/...)与桌面(/)各自缓存各自的外壳，离线回退到对的那个。
        const isMobile = url.pathname === "/mobile.html" || url.pathname.startsWith("/m/");
        try {
          const res = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(isMobile ? "/mobile.html" : "/", res.clone()).catch(() => {});
          return res;
        } catch {
          return (
            (isMobile ? await caches.match("/mobile.html") : null) ||
            (await caches.match("/")) ||
            (await caches.match("/index.html")) ||
            (await caches.match("/offline.html")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // 后端 API（同源）：network-first，离线回退到缓存的最近一次响应
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // 跨源 Google 字体
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // 同源静态资源 / 3D / 音频：按需缓存，二次访问可离线
  if (url.origin === self.location.origin && isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }
});
