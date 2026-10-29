import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../../../common/api-error';
import { UsersRepository } from '../users.repository';
import {
  ADMIN_ONLY,
  ALLOW_PENDING_PASSWORD_CHANGE,
  IS_PUBLIC,
  OPTIONAL_AUTH,
  REQUIRED_TAG,
} from './auth.decorators';
import { AUTH_SESSION_COOKIE, type RoleTag } from './auth.types';
import { AuthSessionStore } from './auth-session-store';

/** Guard toàn cục: mọi route cần phiên hợp lệ, trừ route gắn @Public(); kiểm tra @AdminOnly(), @RequireTag(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authSessions: AuthSessionStore,
    private readonly usersRepo: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<FastifyRequest & { auth?: unknown }>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    if (isPublic && !this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, targets)) return true;

    const auth = await this.authenticate(request);
    if (isPublic) {
      if (auth) request.auth = auth;
      return true;
    }
    if (!auth) throw new ApiError('UNAUTHENTICATED');
    request.auth = auth;
    const { user } = auth;

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, targets)
    ) {
      throw new ApiError('PASSWORD_CHANGE_REQUIRED');
    }
    if (this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets) && !user.isAdmin) {
      throw new ApiError('FORBIDDEN');
    }
    const requiredTag = this.reflector.getAllAndOverride<RoleTag>(REQUIRED_TAG, targets);
    if (requiredTag && !user.roleTags.includes(requiredTag)) throw new ApiError('FORBIDDEN');
    return true;
  }

  /** Người dùng của phiên hợp lệ (chưa Khóa, chưa Xóa), hoặc null. Phiên của người đã Khóa/Xóa bị thu hồi. */
  private async authenticate(request: FastifyRequest) {
    const token = request.cookies?.[AUTH_SESSION_COOKIE];
    const session = token ? await this.authSessions.resolve(token) : null;
    if (!token || !session) return null;

    const row = await this.usersRepo.findById(session.userId);
    if (!row || row.removedAt || row.status === 'locked') {
      await this.authSessions.revokeToken(token, row?.removedAt ? 'user_removed' : 'user_locked');
      return null;
    }
    const user = await this.usersRepo.toAuthenticated(row);
    return { user, authSessionId: session.authSessionId, token };
  }
}
