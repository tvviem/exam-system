/** Trình duyệt và hệ điều hành rút gọn từ tiêu đề User-Agent, cho thư báo "mật khẩu đã đổi" (không ghi IP). */
export function describeClient(userAgent: string | null): { browser?: string; os?: string } {
  if (!userAgent) return {};
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : undefined;
  // Thứ tự quan trọng: Edge và Opera cũng chứa "Chrome", Chrome cũng chứa "Safari".
  const patterns: [string, RegExp][] = [
    ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
    ['Opera', /(?:OPR|Opera)\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+).*Safari/],
  ];
  for (const [name, pattern] of patterns) {
    const match = pattern.exec(userAgent);
    if (match) return { browser: `${name} ${match[1]}`, os };
  }
  return { os };
}
