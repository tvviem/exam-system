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
      const handOver = () => active?.postMessage({ type: 'cache-assets', urls: loadedAssets() });
      // Lần mở đầu tiên: chờ service worker điều khiển trang rồi nhờ nó lưu nốt những file đã tải trước đó.
      if (navigator.serviceWorker.controller) handOver();
      else navigator.serviceWorker.addEventListener('controllerchange', handOver, { once: true });
    } catch {
      // Không đăng ký được (trình duyệt chặn, không phải HTTPS): ứng dụng vẫn chạy, chỉ mất khả năng mở lại khi ngoại tuyến.
    }
  });
}
