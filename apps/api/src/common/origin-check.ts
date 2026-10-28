import type { FastifyInstance } from 'fastify';
import { API_ERROR_STATUS, type ApiErrorCode } from './api-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Chống CSRF (bổ sung cho SameSite=Lax): mọi request đổi dữ liệu tới /api phải mang header Origin
 * nằm trong danh sách cho phép. Trình duyệt luôn gửi Origin cho POST/PUT/PATCH/DELETE.
 */
export function registerOriginCheck(
  fastify: FastifyInstance,
  allowedOrigins: readonly string[],
): void {
  const allowed = new Set(allowedOrigins);
  fastify.addHook('onRequest', async (request, reply) => {
    if (SAFE_METHODS.has(request.method) || !request.url.startsWith('/api/')) return;
    const origin = request.headers.origin;
    if (!origin || !allowed.has(origin)) {
      const code: ApiErrorCode = 'FORBIDDEN_ORIGIN';
      await reply.code(API_ERROR_STATUS[code]).send({ code });
    }
  });
}
