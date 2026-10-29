// Đặt <html data-theme> trước khi trang hiển thị để không nháy trắng (docs/ui-design.md mục 4).
// Đồng bộ với src/lib/theme.ts: khóa 'exam:theme', giá trị 'system' | 'light' | 'dark'.
// Đây là nơi duy nhất giữ màu thanh địa chỉ (= token `surface`), theme.ts gọi lại window.examApplyTheme.
(() => {
  var THEME_COLOR = { light: '#ffffff', dark: '#162027' };
  window.examApplyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
  };
  var choice = 'system';
  try {
    choice = localStorage.getItem('exam:theme') || 'system';
  } catch {}
  var dark =
    choice === 'dark' ||
    (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  window.examApplyTheme(dark ? 'dark' : 'light');
})();
