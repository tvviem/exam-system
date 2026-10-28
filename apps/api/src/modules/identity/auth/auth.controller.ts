import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import {
  AllowPendingPasswordChange,
  CurrentSessionId,
  CurrentUser,
  Public,
} from './auth.decorators';
import { AuthService } from './auth.service';
import { type AuthenticatedUser, SESSION_COOKIE } from './auth.types';
import { AuthError } from './auth-error';
import { SessionStore } from './session-store';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});

const loginSchema = z.object({
  identifier: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = loginSchema.parse(body ?? {});
    const { token, maxAgeSeconds } = await this.auth.login(
      input.identifier,
      input.password,
      metaOf(req),
    );
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds,
    });
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await this.sessions.revokeToken(token, 'logout');
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('sessions')
  async listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSessionId() sessionId: string,
  ) {
    const records = await this.sessions.listForUser(user.id);
    return records.map((r) => ({
      id: r.sessionId,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: new Date(r.createdAt).toISOString(),
      lastSeenAt: new Date(r.lastSeenAt).toISOString(),
      current: r.sessionId === sessionId,
    }));
  }

  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!(await this.sessions.revokeOwnSession(user.id, id, 'logout_by_user')))
      throw new AuthError('NOT_FOUND');
    return { ok: true };
  }

  @AllowPendingPasswordChange()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSessionId() sessionId: string,
  ) {
    const input = changePasswordSchema.parse(body ?? {});
    await this.auth.changePassword(user, sessionId, input.currentPassword, input.newPassword);
    return { ok: true };
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      tags: user.tags,
      mustChangePassword: user.mustChangePassword,
    };
  }
}

export function metaOf(req: FastifyRequest) {
  const userAgent = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
  };
}
