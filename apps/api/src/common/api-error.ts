import { HttpException, HttpStatus } from '@nestjs/common';

/** Mã lỗi api trả cho client; web dịch qua `errors.<code>` trong vi.json. */
export const API_ERROR_STATUS = {
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  LOGIN_TEMPORARILY_BLOCKED: HttpStatus.TOO_MANY_REQUESTS,
  ACCOUNT_LOCKED: HttpStatus.FORBIDDEN,
  TEMPORARY_PASSWORD_EXPIRED: HttpStatus.UNAUTHORIZED,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  PASSWORD_CHANGE_REQUIRED: HttpStatus.FORBIDDEN,
  FORBIDDEN_ORIGIN: HttpStatus.FORBIDDEN,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  CANNOT_TARGET_SELF: HttpStatus.FORBIDDEN,
  WRONG_CURRENT_PASSWORD: HttpStatus.BAD_REQUEST,
  PASSWORD_POLICY: HttpStatus.BAD_REQUEST,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  INVALID_ACCESS_CODE: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  INVITATION_UNAVAILABLE: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  SLIP_EXPIRED: HttpStatus.GONE,
  INVALID_STATE: HttpStatus.CONFLICT,
  HAS_CONTENT: HttpStatus.CONFLICT,
  /** Khóa hay Xóa người đang trong Phiên thi đang diễn ra (Q264). */
  USER_IN_LIVE_SESSION: HttpStatus.CONFLICT,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

/** Lỗi trả cho client dạng `{ code, ...details }`. */
export class ApiError extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    details: Record<string, unknown> = {},
  ) {
    super({ code, ...details }, API_ERROR_STATUS[code]);
  }
}

/** Một lỗi dữ liệu ở trường `path`; `code` để giao diện chọn thông báo (`errors.VALIDATION_<code>`). */
export const validationFailed = (path: string, code: string) =>
  new ApiError('VALIDATION_FAILED', { issues: [{ path, code }] });
