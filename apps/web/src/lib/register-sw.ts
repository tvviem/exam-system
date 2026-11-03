// Đăng ký service worker (public/sw.js) để làm bài tiếp được khi tải lại lúc mất mạng (Q243). Chỉ ở bản dựng thật:
// chạy `vite dev` mà lưu đệm thì rất dễ thấy mã cũ.

/** File /assets mà trang đã tải; trước khi service worker điều khiển được trang thì chúng chưa vào bộ nhớ đệm. */
const loadedAssets = () =>
  performance
    .getEntriesByType('resource')
    .map((entry) => new URL(entry.name))
    .filter((url) => url.origin === location.origin && url.pathname.startsWith('/assets/'))
    .map((url) => url.pathname);

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      const { active } = await navigator.serviceWorker.ready;
      const send = (urls: string[]) => active?.postMessage({ type: 'cache-assets', urls });
      // Lần mở đầu tiên: file nào trang đã xin trước khi service worker điều khiển được trang thì không đi qua nó, nên
      // chưa có trong bộ nhớ đệm. Nhờ nó lưu nốt, kể cả những file xin trước mốc đó nhưng về sau mới xong.
      if (navigator.serviceWorker.controller) return;
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          const controlledAt = performance.now();
          send(loadedAssets());
          const late = new PerformanceObserver((list) => {
            const urls = list
              .getEntries()
              .filter((entry) => entry.startTime < controlledAt)
              .map((entry) => new URL(entry.name))
              .filter(
                (url) => url.origin === location.origin && url.pathname.startsWith('/assets/'),
              )
              .map((url) => url.pathname);
            if (urls.length > 0) send(urls);
          });
          late.observe({ type: 'resource' });
          setTimeout(() => late.disconnect(), 15_000);
        },
        { once: true },
      );
    } catch {
      // Không đăng ký được (trình duyệt chặn, không phải HTTPS): ứng dụng vẫn chạy, chỉ mất khả năng mở lại khi ngoại tuyến.
    }
  });
}
