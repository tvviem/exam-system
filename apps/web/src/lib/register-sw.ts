// Đăng ký service worker (public/sw.js) để làm bài tiếp được khi tải lại lúc mất mạng (Q243). Chỉ ở bản dựng thật:
// chạy `vite dev` mà lưu đệm thì rất dễ thấy mã cũ.

/** File /assets mà trang đã tải. File nào xin trước khi service worker điều khiển được trang thì không đi qua nó. */
const assetPath = (name: string) => {
  const url = new URL(name);
  return url.origin === location.origin && url.pathname.startsWith('/assets/')
    ? url.pathname
    : null;
};
const loadedAssets = () =>
  performance
    .getEntriesByType('resource')
    .map((entry) => assetPath(entry.name))
    .filter((path): path is string => path !== null);

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      const { active } = await navigator.serviceWorker.ready;
      const send = (urls: string[]) => {
        if (urls.length > 0) active?.postMessage({ type: 'cache-assets', urls });
      };
      // Lần mở đầu tiên: những file trang đã xin trước khi service worker kịp điều khiển chưa nằm trong bộ nhớ đệm, nên gửi
      // danh sách để nó lưu nốt. KHÔNG phụ thuộc `controller` hay sự kiện `controllerchange`: trên máy chậm service worker có
      // thể đã nắm quyền trước khi tới đây (hoặc sự kiện đến trước khi nghe), nên chờ sự kiện đó sẽ bỏ sót cả lô. Service
      // worker bỏ qua file đã có, nên gửi nhiều lần không hại.
      send(loadedAssets());
      // File xin trước mốc đó nhưng về sau mới xong, và file lazy-load về sau, lần lượt hiện thêm trong 15 giây tới.
      const late = new PerformanceObserver((list) => {
        send(list.getEntries().flatMap((entry) => assetPath(entry.name) ?? []));
      });
      late.observe({ type: 'resource', buffered: true });
      setTimeout(() => late.disconnect(), 15_000);
    } catch {
      // Không đăng ký được (trình duyệt chặn, không phải HTTPS): ứng dụng vẫn chạy, chỉ mất khả năng mở lại khi ngoại tuyến.
    }
  });
}
