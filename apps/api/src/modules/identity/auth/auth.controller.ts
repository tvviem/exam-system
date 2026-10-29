import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../../common/api-error';
import {
  AllowPendingPasswordChange,
  CurrentAuthSessionId,
  CurrentUser,
  Public,
} from './auth.decorators';
import { AuthService } from './auth.service';
import { AUTH_SESSION_COOKIE, type AuthenticatedUser } from './auth.types';
import { setAuthSessionCookie } from './auth-cookie';
import { AuthSessionStore } from './auth-session-store';

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
    private readonly authSessions: AuthSessionStore,
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
      authSessionMetaFrom(req),
    );
    setAuthSessionCookie(reply, token, maxAgeSeconds);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = req.cookies[AUTH_SESSION_COOKIE];
    if (token) await this.authSessions.revokeToken(token, 'logout');
    reply.clearCookie(AUTH_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('auth-sessions')
  async listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthSessionId() authSessionId: string,
  ) {
    const records = await this.authSessions.listForUser(user.id);
    return records.map((r) => ({
      id: r.authSessionId,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: new Date(r.createdAt).toISOString(),
      lastSeenAt: new Date(r.lastSeenAt).toISOString(),
      current: r.authSessionId === authSessionId,
    }));
  }

  @Delete('auth-sessions/:id')
  async revokeAuthSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!(await this.authSessions.revokeOwnAuthSession(user.id, id)))
      throw new ApiError('NOT_FOUND');
    return { ok: true };
  }

  @AllowPendingPasswordChange()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthSessionId() authSessionId: string,
  ) {
    const input = changePasswordSchema.parse(body ?? {});
    await this.auth.changePassword(user, authSessionId, input.currentPassword, input.newPassword);
    return { ok: true };
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      roleTags: user.roleTags,
      mustChangePassword: user.mustChangePassword,
    };
  }
}

export function authSessionMetaFrom(req: FastifyRequest) {
  const userAgent = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
  };
}
