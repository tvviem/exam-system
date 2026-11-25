import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { ApiError } from './api-error';
import { GateBusyError, heavyQueryGate } from './heavy-query-gate';

/** Nhóm truy vấn và số trang một người được chạy cùng lúc trong nhóm đó (Q482). */
const PER_USER = { questions: 2, users: 1, roster: 1, logs: 1 } as const;
export type HeavyQueryGroup = keyof typeof PER_USER;

const GROUP = 'heavy-query-group';

@Injectable()
class HeavyQueryInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const group = this.reflector.get<HeavyQueryGroup>(GROUP, context.getHandler());
    const http = context.switchToHttp();
    const userId: string = http.getRequest().auth.user.id;
    // Trình duyệt bỏ yêu cầu cũ (gõ tiếp vào ô tìm) thì yêu cầu đang chờ rời hàng, không chạy truy vấn vô ích.
    const gone = new AbortController();
    const response = http.getResponse().raw;
    response.once('close', () => {
      if (!response.writableEnded) gone.abort();
    });
    return from(
      heavyQueryGate()
        .run(`${group}:${userId}`, PER_USER[group], () => lastValueFrom(next.handle()), gone.signal)
        .catch((error) => {
          if (error instanceof GateBusyError) throw new ApiError('SERVER_BUSY');
          throw error;
        }),
    );
  }
}

/** Đánh dấu API danh sách hay tìm kiếm có thể chậm: chỉ chạy khi cổng chung còn chỗ (heavy-query-gate.ts). */
export const HeavyQuery = (group: HeavyQueryGroup) =>
  applyDecorators(SetMetadata(GROUP, group), UseInterceptors(HeavyQueryInterceptor));
