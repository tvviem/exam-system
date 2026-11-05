import { heartbeatSchema } from '@exam/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { clientIpOf } from '../identity/auth/auth-request';
import { AttemptsService, type ClientMeta } from './attempts.service';
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_SECONDS } from './device-key';

const joinSchema = z.strictObject({ code: z.string().trim().min(1).max(32) });
const saveSchema = z.strictObject({
  items: z
    .array(
      z
        .strictObject({
          itemId: z.uuid(),
          clientSeq: z
            .number()
            .int()
            .min(0)
            .max(2 ** 31 - 1),
          value: z.unknown().optional(),
          flagged: z.boolean().optional(),
        })
        .refine((item) => item.value !== undefined || item.flagged !== undefined, {
          message: 'value_or_flagged',
        }),
    )
    .min(1)
    .max(50),
});

const deviceKeyOf = (req: FastifyRequest): string | undefined => {
  const value = req.cookies?.[DEVICE_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const metaOf = (req: FastifyRequest): ClientMeta => {
  const agent = req.headers['user-agent'];
  return { ip: clientIpOf(req), userAgent: typeof agent === 'string' ? agent.slice(0, 512) : null };
};

/** Khu làm bài của Người dự thi (Q229–Q233). Mọi thao tác dự thi đi cùng cookie mã thiết bị (ADR-0007). */
@RequireTag('candidate')
@Controller('take')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    return this.attempts.listFor(user.id, deviceKeyOf(req));
  }

  @Post('join')
  @HttpCode(200)
  async join(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { code } = joinSchema.parse(body ?? {});
    const result = await this.attempts.join(user.id, deviceKeyOf(req), code, metaOf(req));
    reply.setCookie(DEVICE_COOKIE, result.deviceKey, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    });
    return { sessionId: result.sessionId, attemptId: result.attemptId, waiting: result.waiting };
  }

  /** Nhịp của Phòng chờ (Q284): báo còn trực tuyến, nhận giờ server và giờ mở để đếm ngược. */
  @Post('sessions/:id/waiting')
  @HttpCode(200)
  waiting(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    return this.attempts.waiting(user.id, deviceKeyOf(req), id);
  }

  @Post('sessions/:id/start')
  @HttpCode(200)
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    return this.attempts.start(user.id, deviceKeyOf(req), id);
  }

  @Get('attempts/:id')
  view(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    return this.attempts.view(user.id, deviceKeyOf(req), id);
  }

  @Put('attempts/:id/responses')
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    const { items } = saveSchema.parse(body ?? {});
    return this.attempts.saveResponses(user.id, deviceKeyOf(req), id, items);
  }

  @Post('attempts/:id/heartbeat')
  @HttpCode(200)
  heartbeat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    return this.attempts.heartbeat(
      user.id,
      deviceKeyOf(req),
      id,
      heartbeatSchema.parse(body ?? {}),
    );
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    return this.attempts.submit(user.id, deviceKeyOf(req), id);
  }
}
