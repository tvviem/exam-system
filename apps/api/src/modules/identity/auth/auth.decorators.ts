import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Actor } from '../../../common/actor';
import type { AuthenticatedUser, RoleTag } from './auth.types';
import { clientIpOf } from './auth-request';

export const IS_PUBLIC = 'auth:public';
export const ALLOW_PENDING_PASSWORD_CHANGE = 'auth:allow-pending-password-change';
export const ADMIN_ONLY = 'auth:admin-only';
export const REQUIRED_TAG = 'auth:required-tag';
export const OPTIONAL_AUTH = 'auth:optional';

/** Không cần đăng nhập. Mặc định mọi route đều cần. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Dùng cùng @Public(): ai cũng gọi được, nhưng nếu có phiên hợp lệ thì handler biết người gọi là ai
 * (@CurrentUserOrNull). Phiên không hợp lệ được coi như chưa đăng nhập.
 */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH, true);

/** Vẫn gọi được khi người dùng chưa đổi mật khẩu tạm. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

/** Chỉ Quản trị viên. */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

/** Chỉ Người dùng mang Nhãn vai trò này. Quản trị viên không mang nhãn nên cũng không vào được. */
export const RequireTag = (tag: RoleTag) => SetMetadata(REQUIRED_TAG, tag);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest().auth.user,
);

export const CurrentAuthSessionId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().auth.authSessionId,
);

/** Người thực hiện thao tác (id + IP), để ghi nhật ký thao tác. */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest();
  return { id: req.auth.user.id, ip: clientIpOf(req) };
});

export const CurrentUserOrNull = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser | null =>
    ctx.switchToHttp().getRequest().auth?.user ?? null,
);
