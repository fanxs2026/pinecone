/* Pinecone Service Worker（Phase 3-① PWA 离线缓存）
 * 2026-08-15 策略收紧（修复 dev 下页面异常刷新循环的隐患）：
 *  - 只缓存静态资源（/_next/static、/manifest.webmanifest、logo 等）
 *  - 【不再缓存】页面 HTML（/、/login 等导航请求）——避免 SW 接管导航、
 *    缓存陈旧页面导致浏览器反复加载/刷新异常
 *  - 【不再缓存】/api/* 响应——避免缓存带认证的数据
 *  - 页面与 API 请求一律直连网络（离线时页面走 /offline 占位）
 */
const VERSION = 'pinecone-sw-v2';
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/pinecone-logo.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.get('range')) return;

  // 只接管静态资源：/_next/static 与 public 下的确定性文件
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/pinecone-logo.jpg';

  if (!isStatic) return; // 页面/API 直连网络，SW 不干预

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(VERSION).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
