import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';

/** Dữ liệu gửi lên sai schema Zod: trả 400 kèm danh sách trường lỗi. */
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(error: ZodError, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<FastifyReply>()
      .status(400)
      .send({
        code: 'VALIDATION_FAILED',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
      });
  }
}
