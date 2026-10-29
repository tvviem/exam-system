import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Q104: bảng token ở docs/ui-design.md mục 3 phải giữ độ tương phản WCAG 2.2 ở cả hai chế độ.
// Đọc thẳng index.css nên sửa token làm tụt chuẩn thì CI đỏ.

const css = readFileSync(path.resolve(__dirname, 'index.css'), 'utf8');

function tokensOf(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `không thấy khối ${selector} trong index.css`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--c-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  );
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const TEXT = 4.5;
const COMPONENT = 3.0;
// [chữ hoặc biểu tượng, nền, ngưỡng]
const PAIRS: [string, string, number][] = [
  ['fg', 'bg', TEXT],
  ['fg', 'surface', TEXT],
  ['fg', 'surface-raised', TEXT],
  ['fg-muted', 'bg', TEXT],
  ['fg-muted', 'surface', TEXT],
  ['fg-muted', 'surface-raised', TEXT],
  ['on-primary', 'primary', TEXT],
  ['on-primary', 'primary-hover', TEXT],
  ['primary', 'surface', TEXT],
  ['primary', 'bg', TEXT],
  ['primary', 'primary-soft', TEXT],
  ['on-primary-soft', 'primary-soft', TEXT],
  ['on-danger', 'danger', TEXT],
  ['danger', 'surface', TEXT],
  ['danger', 'danger-soft', TEXT],
  ['warning', 'surface', TEXT],
  ['warning', 'warning-soft', TEXT],
  ['success', 'surface', TEXT],
  ['success', 'success-soft', TEXT],
  ['border-strong', 'surface', COMPONENT],
  ['border-strong', 'bg', COMPONENT],
  ['ring', 'surface', COMPONENT],
  ['ring', 'bg', COMPONENT],
];

describe.each([
  ['sáng', ':root'],
  ['tối', '[data-theme="dark"]'],
])('token chế độ %s', (_name, selector) => {
  const tokens = tokensOf(selector);

  it('đủ mọi token trong bảng (mỗi token là mã hex)', () => {
    for (const [fg, bg] of PAIRS) {
      expect(tokens[fg], `thiếu --c-${fg}`).toBeDefined();
      expect(tokens[bg], `thiếu --c-${bg}`).toBeDefined();
    }
  });

  it.each(PAIRS)('%s trên %s đạt ít nhất %s:1', (fg, bg, min) => {
    const ratio = contrast(tokens[fg] as string, tokens[bg] as string);
    expect(
      ratio,
      `${fg} ${tokens[fg]} trên ${bg} ${tokens[bg]} = ${ratio.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(min);
  });
});

describe('bản sắc teal (Q100)', () => {
  it('màu chủ đạo là xanh ngọc ở cả hai chế độ', () => {
    expect(tokensOf(':root').primary).toBe('#0e6e5c');
    expect(tokensOf('[data-theme="dark"]').primary).toBe('#41c2a1');
  });
});
