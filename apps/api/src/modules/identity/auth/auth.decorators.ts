import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedUser } from './auth.types';

export const IS_PUBLIC = 'auth:public';
export const ALLOW_PENDING_PASSWORD_CHANGE = 'auth:allow-pending-password-change';

/** Không cần đăng nhập. Mặc định mọi route đều cần. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Vẫn gọi được khi người dùng chưa đổi mật khẩu tạm. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest().auth.user,
);

export const CurrentSessionId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().auth.sessionId,
);
