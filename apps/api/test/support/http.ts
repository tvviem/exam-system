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

export interface UploadFile {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/** Gửi multipart/form-data: một file (trường `file`) và các trường chữ. */
export async function upload(
  app: NestFastifyApplication,
  url: string,
  file: UploadFile,
  options: { cookie?: string; fields?: Record<string, string> } = {},
) {
  const boundary = `----exam-test-${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(options.fields ?? {})) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
        `Content-Type: ${file.contentType ?? 'application/octet-stream'}\r\n\r\n`,
    ),
    file.content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return app.inject({
    method: 'POST',
    url,
    headers: {
      origin: ORIGIN,
      'content-type': `multipart/form-data; boundary=${boundary}`,
      ...(options.cookie ? { cookie: `${AUTH_SESSION_COOKIE}=${options.cookie}` } : {}),
    },
    remoteAddress: '10.0.0.1',
    payload: Buffer.concat(parts),
  });
}
