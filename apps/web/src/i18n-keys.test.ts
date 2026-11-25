import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import vi from './i18n/vi.json';

// Mọi `t('khóa.viết.thẳng')` trong mã phải trỏ tới một CHUỖI. Nếu khóa là một nhóm con (object) thì giao diện hiện lỗi tiếng Anh
// `key '...' returned an object instead of string` (đã từng xảy ra ở nhãn "Email" của trang Tài khoản của tôi).

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(tsx?|ts)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')
      ? [path]
      : [];
  });

const lookup = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      vi,
    );

describe('khóa dịch dùng trong mã', () => {
  it('không khóa nào viết thẳng trong t(...) trỏ tới một nhóm thay vì chuỗi', () => {
    const wrong: string[] = [];
    for (const file of walk(join(__dirname))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bt\(\s*'([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)'/g)) {
        const key = match[1] as string;
        const value = lookup(key);
        if (value !== null && typeof value === 'object')
          wrong.push(`${file.replace(__dirname, 'src')}: ${key}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
