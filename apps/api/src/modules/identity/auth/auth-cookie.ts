import type { FastifyReply } from 'fastify';
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
