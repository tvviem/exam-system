import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy } from './password-policy';

const owner = { username: 'b2103456', email: 'an.nguyen@example.edu.vn', code: 'B2103456' };

describe('checkPasswordPolicy', () => {
  it('chấp nhận mật khẩu dài 10 ký tự không nằm trong danh sách phổ biến', () => {
    expect(checkPasswordPolicy('trang-xanh-7', owner)).toEqual([]);
  });

  it('không bắt buộc chữ hoa, số hay ký tự đặc biệt', () => {
    expect(checkPasswordPolicy('hoaphuongdo', owner)).toEqual([]);
  });

  it('từ chối mật khẩu ngắn hơn 10 ký tự', () => {
    expect(checkPasswordPolicy('ngan-qua', owner)).toEqual(['too_short']);
  });

  it('từ chối mật khẩu dài hơn 128 ký tự', () => {
    expect(checkPasswordPolicy('a'.repeat(129), owner)).toEqual(['too_long']);
  });

  it('đếm độ dài theo ký tự, không theo byte', () => {
    expect(checkPasswordPolicy('mậtkhẩuđẹp', owner)).toEqual([]);
  });

  it('từ chối mật khẩu có trong danh sách phổ biến, không phân biệt hoa thường', () => {
    expect(checkPasswordPolicy('QwertyUiop', owner)).toEqual(['common']);
    expect(checkPasswordPolicy('matkhau123', owner)).toEqual(['common']);
  });

  it('từ chối mật khẩu chứa tên đăng nhập hoặc Mã định danh', () => {
    expect(checkPasswordPolicy('b2103456xyz', owner)).toEqual(['contains_identity']);
    expect(checkPasswordPolicy('xx-B2103456', owner)).toEqual(['contains_identity']);
  });

  it('từ chối mật khẩu trùng email', () => {
    expect(checkPasswordPolicy('An.Nguyen@example.edu.vn', owner)).toEqual(['contains_identity']);
  });

  it('bỏ qua thông tin định danh còn trống', () => {
    expect(
      checkPasswordPolicy('trang-xanh-7', { username: null, email: null, code: null }),
    ).toEqual([]);
  });
});
