import { describe, expect, it } from 'vitest';
import { formatFileSize } from './format';

describe('formatFileSize: dung lượng file hiện cho người dùng', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [1536, '1,5 KB'],
    [100 * 1024, '100 KB'],
    [1024 * 1024, '1 MB'],
    [Math.round(1.25 * 1024 * 1024), '1,3 MB'],
    [2 * 1024 * 1024, '2 MB'],
  ])('%d byte là %s', (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });
});
