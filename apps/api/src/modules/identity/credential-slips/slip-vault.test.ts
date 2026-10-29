import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../config/env';
import { SlipVault } from './slip-vault';

const vaultWith = (key = randomBytes(32)) =>
  new SlipVault({ SLIP_ENCRYPTION_KEY: key.toString('base64') } as Env);

describe('SlipVault (AES-256-GCM)', () => {
  it('mã hóa rồi giải mã trả về đúng nội dung', () => {
    const vault = vaultWith();
    const plain = Buffer.from('Mật khẩu tạm: abc-123', 'utf8');
    const sealed = vault.encrypt(plain);
    expect(sealed.includes(plain)).toBe(false);
    expect(vault.decrypt(sealed).equals(plain)).toBe(true);
  });

  it('mỗi lần mã hóa cho kết quả khác nhau (IV ngẫu nhiên)', () => {
    const vault = vaultWith();
    const plain = Buffer.from('giống nhau');
    expect(vault.encrypt(plain).equals(vault.encrypt(plain))).toBe(false);
  });

  it('sai khóa thì lỗi', () => {
    const sealed = vaultWith().encrypt(Buffer.from('bí mật'));
    expect(() => vaultWith().decrypt(sealed)).toThrow();
  });

  it('nội dung bị sửa dù một bit thì lỗi', () => {
    const key = randomBytes(32);
    const sealed = vaultWith(key).encrypt(Buffer.from('bí mật'));
    sealed[sealed.length - 1] = (sealed[sealed.length - 1] ?? 0) ^ 1;
    expect(() => vaultWith(key).decrypt(sealed)).toThrow();
  });

  it('khóa không đúng 32 byte bị từ chối ngay khi khởi tạo', () => {
    expect(() => vaultWith(randomBytes(16))).toThrow(/32 byte/);
  });
});
