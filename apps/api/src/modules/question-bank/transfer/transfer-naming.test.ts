import { normalizeForSearch } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import { transferredTopicName } from './transfer-naming';

const keys = (...names: string[]) => new Set(names.map(normalizeForSearch));

describe('đặt tên Chủ đề khi Chuyển giao (Q148)', () => {
  it('không trùng thì giữ nguyên tên', () => {
    expect(transferredTopicName('Giải tích', 'Nguyễn Văn A', keys('Đại số'))).toBe('Giải tích');
  });

  it('trùng thì thêm " (từ <tên người cho>)"', () => {
    expect(transferredTopicName('Giải tích', 'Nguyễn Văn A', keys('Giải tích'))).toBe(
      'Giải tích (từ Nguyễn Văn A)',
    );
  });

  it('so trùng không phân biệt hoa thường và dấu', () => {
    expect(transferredTopicName('GIAI TICH', 'An', keys('giải tích'))).toBe('GIAI TICH (từ An)');
  });

  it('vẫn trùng thì thêm " (2)", " (3)"...', () => {
    const taken = keys('Giải tích', 'Giải tích (từ An)');
    expect(transferredTopicName('Giải tích', 'An', taken)).toBe('Giải tích (từ An) (2)');
    taken.add(normalizeForSearch('Giải tích (từ An) (2)'));
    expect(transferredTopicName('Giải tích', 'An', taken)).toBe('Giải tích (từ An) (3)');
  });

  it('không đổi tập `taken` của người gọi', () => {
    const taken = keys('Giải tích');
    transferredTopicName('Giải tích', 'An', taken);
    expect([...taken]).toEqual(['giai tich']);
  });

  it('tên mới không dài quá 100 ký tự: cắt phần tên gốc, giữ nguyên hậu tố', () => {
    const long = 'x'.repeat(100);
    const result = transferredTopicName(long, 'An', keys(long));
    expect(result).toHaveLength(100);
    expect(result.endsWith(' (từ An)')).toBe(true);
    expect(result.startsWith('xxxx')).toBe(true);
  });

  it('cắt xong mà vẫn trùng thì đánh số và vẫn trong 100 ký tự', () => {
    const long = 'x'.repeat(100);
    const first = transferredTopicName(long, 'An', keys(long));
    const second = transferredTopicName(long, 'An', keys(long, first));
    expect(second).toHaveLength(100);
    expect(second.endsWith(' (từ An) (2)')).toBe(true);
    expect(second).not.toBe(first);
  });

  it('tên người cho rất dài (tới 200 ký tự) vẫn cho tên mới ≤ 100 ký tự và còn phần tên gốc', () => {
    const owner = 'Nguyễn '.repeat(40).trim();
    const first = transferredTopicName('Giải tích', owner, keys('Giải tích'));
    expect(first.length).toBeLessThanOrEqual(100);
    expect(first.startsWith('Giải tích (từ Nguyễn')).toBe(true);
    const second = transferredTopicName('Giải tích', owner, keys('Giải tích', first));
    expect(second.length).toBeLessThanOrEqual(100);
    expect(second).not.toBe(first);
    expect(second.endsWith(' (2)')).toBe(true);
  });

  it('tên người cho có khoảng trắng thừa được gọn lại', () => {
    expect(transferredTopicName('A', '  Trần   Thị B ', keys('A'))).toBe('A (từ Trần Thị B)');
  });
});
