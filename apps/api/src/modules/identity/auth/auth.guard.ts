import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../../../common/api-error';
import { UsersRepository } from '../users.repository';
import { ALLOW_PENDING_PASSWORD_CHANGE, IS_PUBLIC } from './auth.decorators';
import { AUTH_SESSION_COOKIE } from './auth.types';
import { AuthSessionStore } from './auth-session-store';

/** Guard toàn cục: mọi route cần phiên hợp lệ, trừ route gắn @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authSessions: AuthSessionStore,
    private readonly usersRepo: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { auth?: unknown }>();
    const token = request.cookies?.[AUTH_SESSION_COOKIE];
    const session = token ? await this.authSessions.resolve(token) : null;
    if (!token || !session) throw new ApiError('UNAUTHENTICATED');

    const row = await this.usersRepo.findById(session.userId);
    if (!row || row.removedAt || row.status === 'locked') {
      await this.authSessions.revokeToken(token, row?.removedAt ? 'user_removed' : 'user_locked');
      throw new ApiError('UNAUTHENTICATED');
    }
    const user = await this.usersRepo.toAuthenticated(row);
    request.auth = { user, authSessionId: session.authSessionId, token };

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, targets)
    ) {
      throw new ApiError('PASSWORD_CHANGE_REQUIRED');
    }
    return true;
  }
}
