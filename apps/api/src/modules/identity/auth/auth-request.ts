import { isIP } from 'node:net';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AUTH_SESSION_COOKIE } from './auth.types';

export function setAuthSessionCookie(reply: FastifyReply, token: string, maxAgeSeconds: number) {
  reply.setCookie(AUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true, // ADR-0004; trình duyệt vẫn nhận cookie Secure trên http://localhost
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/** Địa chỉ IP của khách, hoặc `null` nếu không phải địa chỉ hợp lệ (nhật ký lưu vào cột `inet`, giá trị rác sẽ làm lỗi). */
export function clientIpOf(req: FastifyRequest): string | null {
  return typeof req.ip === 'string' && isIP(req.ip) !== 0 ? req.ip : null;
}

export function authSessionMetaFrom(req: FastifyRequest) {
  const userAgent = req.headers['user-agent'];
  return {
    ip: clientIpOf(req),
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
  };
}
