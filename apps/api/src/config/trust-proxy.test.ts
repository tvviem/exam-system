import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { parseTrustProxy } from './env';

// Địa chỉ IP thật của Người dự thi (Q224, Q235): giới hạn đăng nhập theo IP và nhật ký đăng nhập dựa vào `req.ip`.

async function ipSeenBy(trustProxy: string, peer: string, forwardedFor?: string) {
  const app = Fastify({ trustProxy: parseTrustProxy(trustProxy) });
  app.get('/ip', async (req) => req.ip);
  const res = await app.inject({
    method: 'GET',
    url: '/ip',
    remoteAddress: peer,
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  });
  await app.close();
  return res.body;
}

describe('req.ip theo TRUST_PROXY', () => {
  it('nginx cùng pod (loopback) gửi một địa chỉ khách: lấy đúng địa chỉ đó', async () => {
    expect(await ipSeenBy('loopback', '127.0.0.1', '203.0.113.7')).toBe('203.0.113.7');
  });

  it('kết nối không đến từ nơi được tin thì bỏ qua X-Forwarded-For tự khai', async () => {
    expect(await ipSeenBy('loopback', '198.51.100.9', '203.0.113.7')).toBe('198.51.100.9');
  });

  it('không có X-Forwarded-For thì lấy địa chỉ kết nối', async () => {
    expect(await ipSeenBy('loopback', '127.0.0.1')).toBe('127.0.0.1');
  });

  it('khai thêm dải địa chỉ được tin để vượt qua một tầng proxy', async () => {
    expect(await ipSeenBy('loopback, 10.0.0.0/8', '127.0.0.1', '203.0.113.7, 10.0.2.2')).toBe(
      '203.0.113.7',
    );
  });
});
