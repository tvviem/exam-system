import { describe, expect, it } from 'vitest';
import { normalizePersonName } from './person-name';

describe('normalizePersonName', () => {
  it('bỏ dấu, đ thành d, không phân biệt hoa thường, gộp khoảng trắng', () => {
    expect(normalizePersonName('  Nguyễn   Văn  Đức ')).toBe('nguyen van duc');
    expect(normalizePersonName('NGUYEN VAN DUC')).toBe('nguyen van duc');
  });

  it('chuẩn hóa cả dạng ký tự tổ hợp', () => {
    expect(normalizePersonName('Nguyễn Văn A')).toBe('nguyen van a');
  });

  it('hai tên khác nhau vẫn khác nhau', () => {
    expect(normalizePersonName('Lê Văn An')).not.toBe(normalizePersonName('Lê Văn Anh'));
  });
});
