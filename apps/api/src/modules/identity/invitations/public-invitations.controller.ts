import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentUserOrNull, OptionalAuth, Public } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { authSessionMetaFrom, clientIpOf, setAuthSessionCookie } from '../auth/auth-request';
import { academicDegreeEnum, academicTitleEnum } from '../identity.schema';
import { InvitationAcceptanceService } from './invitation-acceptance.service';

const acceptSchema = z
  .object({
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

  @Get(':token')
  preview(@Param('token') token: string, @Req() req: FastifyRequest) {
    return this.acceptance.preview(token, clientIpOf(req));
  }

  @OptionalAuth()
  @Post(':token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body() body: unknown,
    @CurrentUserOrNull() current: AuthenticatedUser | null,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { createdAccount, session } = await this.acceptance.accept(
      token,
      acceptSchema.parse(body ?? {}),
      current,
      authSessionMetaFrom(req),
    );
    if (session) setAuthSessionCookie(reply, session.token, session.maxAgeSeconds);
    return { ok: true, createdAccount };
  }
}
