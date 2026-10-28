import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { API_ERROR_STATUS, type ApiErrorCode } from './api-error';

/** Dữ liệu gửi lên sai schema Zod: trả 400 kèm danh sách trường lỗi. */
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(error: ZodError, host: ArgumentsHost) {
    const code: ApiErrorCode = 'VALIDATION_FAILED';
    host
      .switchToHttp()
      .getResponse<FastifyReply>()
      .status(API_ERROR_STATUS[code])
      .send({
        code,
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
      });
  }
}
