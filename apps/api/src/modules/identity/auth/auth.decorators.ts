import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedUser, RoleTag } from './auth.types';

export const IS_PUBLIC = 'auth:public';
export const ALLOW_PENDING_PASSWORD_CHANGE = 'auth:allow-pending-password-change';
export const ADMIN_ONLY = 'auth:admin-only';
export const REQUIRED_TAG = 'auth:required-tag';

/** Không cần đăng nhập. Mặc định mọi route đều cần. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

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
