// Đặt <html data-theme> trước khi trang hiển thị để không nháy trắng (docs/ui-design.md mục 4).
// Đồng bộ với src/lib/theme.ts: khóa 'exam:theme', giá trị 'system' | 'light' | 'dark'.
(() => {
  var choice = 'system';
  try {
    choice = localStorage.getItem('exam:theme') || 'system';
  } catch {}
  var dark =
    choice === 'dark' ||
    (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
