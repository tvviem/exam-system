import { HttpException, HttpStatus } from '@nestjs/common';

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'LOGIN_TEMPORARILY_BLOCKED'
  | 'ACCOUNT_LOCKED'
  | 'TEMPORARY_PASSWORD_EXPIRED'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'FORBIDDEN_ORIGIN'
  | 'WRONG_CURRENT_PASSWORD'
  | 'PASSWORD_POLICY'
  | 'NOT_FOUND';

const STATUS: Record<AuthErrorCode, HttpStatus> = {
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  LOGIN_TEMPORARILY_BLOCKED: HttpStatus.TOO_MANY_REQUESTS,
  ACCOUNT_LOCKED: HttpStatus.FORBIDDEN,
  TEMPORARY_PASSWORD_EXPIRED: HttpStatus.UNAUTHORIZED,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  PASSWORD_CHANGE_REQUIRED: HttpStatus.FORBIDDEN,
  FORBIDDEN_ORIGIN: HttpStatus.FORBIDDEN,
  WRONG_CURRENT_PASSWORD: HttpStatus.BAD_REQUEST,
  PASSWORD_POLICY: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
};

/** Lỗi trả cho client dạng `{ code, ...details }`; web dịch `code` sang tiếng Việt. */
export class AuthError extends HttpException {
  constructor(
    readonly code: AuthErrorCode,
    details: Record<string, unknown> = {},
  ) {
    super({ code, ...details }, STATUS[code]);
  }
}
