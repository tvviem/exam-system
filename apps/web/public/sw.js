// Service worker viết tay cho khu làm bài (docs/plan/slice-4.md, Q243). Chỉ lưu đệm hai thứ:
//  1. vỏ ứng dụng (index.html và các file trong /assets, tên có mã băm), để tải lại trang khi mất mạng vẫn mở được;
//  2. ảnh của đề (`/api/take-media/...`), để ảnh hiện khi mất mạng.
// Không bao giờ lưu đệm response API khác (câu trả lời, giờ, trạng thái luôn phải hỏi server).
// `__BUILD_ID__` do vite.config.ts thay lúc build: mỗi bản dựng một kho vỏ riêng, kho cũ bị xóa khi bản mới kích hoạt.
// Cố ý không `skipWaiting`: bản mới chỉ chạy khi mọi tab cũ đã đóng, để đề thi đang làm không bị đổi mã giữa chừng.

const SHELL = 'exam-shell-__BUILD_ID__';
const MEDIA = 'exam-take-media'; // trùng MEDIA_CACHE ở src/lib/take/local-data.ts; Lượt nộp xong thì trang tự xóa ảnh
const PRECACHE = ['/', '/manifest.webmanifest', '/theme-init.js', '/icon-192.png'];
const NAVIGATION_WAIT_MS = 4000; // mạng chập chờn: quá hạn này thì mở bản đã lưu thay vì treo

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('exam-shell-') && name !== SHELL) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

async function remember(cacheName, request, response) {
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function cacheFirst(cacheName, request) {
  // `ignoreVary`: vite preview (và có thể một CDN) gửi `Vary: Origin`, còn request tự lấy file lúc cài không có Origin.
  const cached = await caches.match(request, { cacheName, ignoreVary: true });
  if (cached) return cached;
  return remember(cacheName, request, await fetch(request));
}

/** Trang (SPA): ưu tiên bản mới từ mạng; mất mạng hay quá chậm thì dùng index.html đã lưu. */
async function navigation(request) {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(reject, NAVIGATION_WAIT_MS, new Error('slow'))),
    ]);
    if (response.ok) await remember(SHELL, '/', response);
    return response;
  } catch {
    const shell = await caches.match('/', { cacheName: SHELL, ignoreVary: true });
    return shell ?? Response.error();
  }
}

// Trang gửi danh sách file /assets mà nó đã tải trước khi service worker kịp điều khiển trang (lần mở đầu tiên),
// để vỏ ứng dụng đủ trong bộ nhớ đệm.
self.addEventListener('message', (event) => {
  const { data } = event;
  if (data?.type !== 'cache-assets' || !Array.isArray(data.urls)) return;
  const urls = new Set(
    data.urls.filter(
      (url) =>
        typeof url === 'string' &&
        new URL(url, self.location.origin).pathname.startsWith('/assets/'),
    ),
  );
  // Từng file riêng (không `addAll`): trùng URL hay một file lỗi không làm hỏng cả lô.
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      Promise.allSettled(
        [...urls].map(async (url) => {
          if (!(await cache.match(url, { ignoreVary: true }))) await cache.add(url);
        }),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const { pathname } = url;
  if (pathname.startsWith('/api/take-media/')) {
    event.respondWith(cacheFirst(MEDIA, request));
  } else if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) {
    // API và WebSocket: để trình duyệt tự xử lý, không lưu đệm.
  } else if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
  } else if (pathname.startsWith('/assets/') || PRECACHE.includes(pathname)) {
    event.respondWith(cacheFirst(SHELL, request));
  }
});
