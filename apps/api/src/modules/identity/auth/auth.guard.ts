import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../../../common/api-error';
import {
  ADMIN_ONLY,
  ALLOW_PENDING_PASSWORD_CHANGE,
  IS_PUBLIC,
  OPTIONAL_AUTH,
  REQUIRED_TAG,
} from './auth.decorators';
import { AUTH_SESSION_COOKIE, type RoleTag } from './auth.types';
import { TokenAuthenticator } from './token-authenticator';

/** Guard toàn cục: mọi route cần phiên hợp lệ, trừ route gắn @Public(); kiểm tra @AdminOnly(), @RequireTag(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticator: TokenAuthenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Cổng Socket.IO tự xác thực lúc bắt tay (cùng TokenAuthenticator); guard này chỉ dành cho HTTP. CẢNH BÁO: ngữ cảnh
    // không phải HTTP đi qua không kiểm gì, nên mọi handler WS mới phải dựa vào `socket.data` do bắt tay đặt và tự kiểm quyền.
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<FastifyRequest & { auth?: unknown }>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    if (isPublic && !this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, targets)) return true;

    const auth = await this.authenticator.authenticate(request.cookies?.[AUTH_SESSION_COOKIE]);
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
}
