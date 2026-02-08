// ===== Service Worker — 网络优先策略 =====
// 每次发版时更新此版本号，旧缓存会自动清除
const CACHE_VERSION = 'v20250209-1';
const CACHE_NAME = `values-corrector-${CACHE_VERSION}`;

// 需要缓存的核心资源（用于离线回退）
const CORE_ASSETS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
];

// ---- install：预缓存核心资源 ----
self.addEventListener('install', (event) => {
    console.log(`[SW] 安装新版本: ${CACHE_VERSION}`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting()) // 立即激活，不等旧 SW 退出
    );
});

// ---- activate：清除旧版本缓存 ----
self.addEventListener('activate', (event) => {
    console.log(`[SW] 激活新版本: ${CACHE_VERSION}`);
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => {
                        console.log(`[SW] 删除旧缓存: ${key}`);
                        return caches.delete(key);
                    })
            )
        ).then(() => self.clients.claim()) // 立即接管所有页面
    );
});

// ---- fetch：网络优先，失败时回退到缓存 ----
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // 只处理 GET 请求；非 GET（POST 等）直接走网络
    if (request.method !== 'GET') return;

    // 跳过非同源请求（第三方 API、CDN 等不缓存）
    if (!request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        fetch(request)
            .then((networkResponse) => {
                // 网络成功：克隆一份存入缓存，然后返回
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, clone);
                });
                return networkResponse;
            })
            .catch(() => {
                // 网络失败（离线）：从缓存中返回
                return caches.match(request).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    // 如果请求的是页面导航，返回缓存的 index.html
                    if (request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

