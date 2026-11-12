import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentUserOrNull, OptionalAuth, Public } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { authSessionMetaFrom, clientIpOf, setAuthSessionCookie } from '../auth/auth-request';
import { academicDegreeEnum, academicTitleEnum } from '../identity.schema';
import { InvitationAcceptanceService } from './invitation-acceptance.service';

const previewSchema = z.object({ token: z.string().min(1).max(200) }).strict();

const acceptSchema = z
  .object({
    token: z.string().min(1).max(200),
    password: z.string().max(1024).optional(),
    academicDegree: z.enum(academicDegreeEnum.enumValues).nullable().optional(),
    academicTitle: z.enum(academicTitleEnum.enumValues).nullable().optional(),
  })
  .strict();

/** Người được mời mở link: không cần đăng nhập để xem; nhận thì tùy việc email đã có tài khoản hay chưa. */
@Public()
@Controller('invitations')
export class PublicInvitationsController {
  constructor(private readonly acceptance: InvitationAcceptanceService) {}

  /** Mã đi trong thân POST (liên kết trong thư dùng mảnh `#`), không ở URL nên không vào nhật ký máy chủ. */
  @Post('preview')
  @HttpCode(200)
  preview(@Body() body: unknown, @Req() req: FastifyRequest) {
    const { token } = previewSchema.parse(body ?? {});
    return this.acceptance.preview(token, clientIpOf(req));
  }

  @OptionalAuth()
  @Post('accept')
  @HttpCode(200)
  async accept(
    @Body() body: unknown,
    @CurrentUserOrNull() current: AuthenticatedUser | null,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { token, ...input } = acceptSchema.parse(body ?? {});
    const { createdAccount, session } = await this.acceptance.accept(
      token,
      input,
      current,
      authSessionMetaFrom(req),
    );
    if (session) setAuthSessionCookie(reply, session.token, session.maxAgeSeconds);
    return { ok: true, createdAccount };
  }
}
