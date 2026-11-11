import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../../common/api-error';
import { Public } from '../auth/auth.decorators';
import { clientIpOf } from '../auth/auth-request';
import { AccountRecoveryService } from './account-recovery.service';

const purposeSchema = z.enum(['activation', 'password_reset']);
const forgotSchema = z.object({ identifier: z.string().min(1).max(320) }).strict();
const statusSchema = z
  .object({ purpose: purposeSchema, token: z.string().min(1).max(200) })
  .strict();
const consumeSchema = statusSchema.extend({ newPassword: z.string().max(1024) }).strict();

/**
 * Người dùng chưa đăng nhập: quên mật khẩu, xem và dùng Liên kết một lần. Mã đi trong thân yêu cầu (POST), không ở URL,
 * nên không vào nhật ký máy chủ.
 */
@Public()
@Controller('auth')
export class AuthLinksController {
  constructor(private readonly recovery: AccountRecoveryService) {}

  /** Luôn trả cùng một câu, dù tài khoản có hay không. */
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: unknown, @Req() req: FastifyRequest) {
    const { identifier } = forgotSchema.parse(body);
    await this.recovery.requestReset(identifier.trim(), clientIpOf(req));
    return { ok: true };
  }

  @Post('links/status')
  @HttpCode(200)
  status(@Body() body: unknown) {
    const { purpose, token } = statusSchema.parse(body);
    return this.recovery.status(token, purpose);
  }

  @Post('links/consume')
  @HttpCode(200)
  async consume(@Body() body: unknown, @Req() req: FastifyRequest) {
    const { purpose, token, newPassword } = consumeSchema.parse(body);
    const result = await this.recovery.complete(token, purpose, newPassword, {
      ip: clientIpOf(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
    if (result.state === 'policy') {
      throw new ApiError('PASSWORD_POLICY', { violations: result.violations });
    }
    return result;
  }
}
