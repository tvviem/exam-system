import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );

describe('ô mật khẩu', () => {
  it('mọi ô mật khẩu dùng PasswordField (có nút hiện và ẩn)', () => {
    const own = files(__dirname).filter(
      (file) =>
        file.endsWith('.tsx') &&
        !file.endsWith('password-field.tsx') &&
        /type=["']password["']/.test(readFileSync(file, 'utf8')),
    );
    expect(own).toEqual([]);
  });
});
