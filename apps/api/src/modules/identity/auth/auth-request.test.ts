import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { authSessionMetaFrom, clientIpOf } from './auth-request';

const request = (ip: unknown) => ({ ip, headers: {} }) as unknown as FastifyRequest;

describe('clientIpOf: chỉ nhận địa chỉ IP hợp lệ (cột `inet`)', () => {
  it.each(['203.0.113.7', '2001:db8::1', '::1'])('giữ %s', (ip) => {
    expect(clientIpOf(request(ip))).toBe(ip);
  });

  it.each(['1.2.3.4, 5.6.7.8', 'không-phải-ip', '999.1.1.1', '', undefined])(
    'bỏ %s thay vì làm hỏng lúc ghi nhật ký',
    (ip) => {
      expect(clientIpOf(request(ip))).toBeNull();
    },
  );

  it('dùng cho cả meta đăng nhập', () => {
    expect(authSessionMetaFrom(request('1.2.3.4, x')).ip).toBeNull();
  });
});
