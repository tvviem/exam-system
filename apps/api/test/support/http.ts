import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ORIGIN } from './app';

export const AUTH_SESSION_COOKIE = 'exam_sid';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface CallOptions {
  cookie?: string;
  body?: unknown;
  origin?: string | null;
  ip?: string;
}

export async function call(
  app: NestFastifyApplication,
  method: Method,
  url: string,
  options: CallOptions = {},
) {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  if (options.cookie) headers.cookie = `${AUTH_SESSION_COOKIE}=${options.cookie}`;
  const res = await app.inject({
    method,
    url,
    headers,
    remoteAddress: options.ip ?? '10.0.0.1',
    ...(options.body === undefined ? {} : { payload: options.body as object }),
  });
  return res;
}

export function sessionCookieOf(res: {
  cookies: { name: string; value: string }[];
}): string | undefined {
  return res.cookies.find((c) => c.name === AUTH_SESSION_COOKIE)?.value;
}

export async function login(
  app: NestFastifyApplication,
  identifier: string,
  password: string,
  ip?: string,
) {
  const res = await call(app, 'POST', '/api/auth/login', { body: { identifier, password }, ip });
  return { res, cookie: sessionCookieOf(res) };
}
