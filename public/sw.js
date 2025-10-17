// 버전만 바꿔도 배포 시 캐시가 교체됩니다.
const PRECACHE = 'ccmarket-precache-v3';
const RUNTIME  = 'ccmarket-runtime-v3';

// 오프라인에서도 필요한 "앱 껍데기" (변경 적은 정적 리소스만)
const PRECACHE_URLS = [
  '/', '/index.html', '/manifest.json', '/favicon.ico',
  '/icons/icon-192x192.png', '/icons/icon-512x512.png'
];

// 설치: 프리캐시
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PRECACHE).then((c) => c.addAll(PRECACHE_URLS)));
  self.skipWaiting(); // 새 SW를 즉시 활성 후보로
});

// 활성화: 예전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== PRECACHE && k !== RUNTIME) ? caches.delete(k) : null))
    )
  );
  self.clients.claim(); // 열린 모든 탭에 즉시 적용
});

// 요청 가로채기
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 1) SPA 네비게이션: 오프라인이면 index.html 폴백
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 2) 정적 산출물(/static/**)·아이콘/이미지: 런타임 캐시(캐시우선)
  const isStatic = sameOrigin && (
    url.pathname.startsWith('/static/') ||
    url.pathname.startsWith('/icons/')  ||
    url.pathname.startsWith('/images/')
  );

  if (isStatic) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const resp = await fetch(req);
          if (resp && resp.status === 200) cache.put(req, resp.clone());
          return resp;
        } catch (e) {
          return caches.match(req) || Promise.reject(e);
        }
      })
    );
    return;
  }

  // 3) 그 외: 캐시 먼저 → 없으면 네트워크
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => undefined))
  );
});
