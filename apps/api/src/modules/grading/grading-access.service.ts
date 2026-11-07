import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import {
  GRADING_SESSIONS,
  type GradingSessionExecutor,
  type GradingSessionInfo,
  type GradingSessions,
} from '../../common/grading-sessions';
import { type Database, DB } from '../../db/db.module';
import { sessionGradingDelegates, sessionGradings } from './grading.schema';

export type GradingRole = 'owner' | 'delegate';

export interface GradingAccess {
  info: GradingSessionInfo;
  role: GradingRole;
}

/**
 * Ai được chấm và xem Kết quả của một Phiên thi (Q292, Q307): chủ Phiên thi, hoặc người đang được Ủy quyền mà không có tên trong
 * Danh sách dự thi. Người khác nhận 404 như Theo dõi.
 */
@Injectable()
export class GradingAccessService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GRADING_SESSIONS) private readonly sessions: GradingSessions,
  ) {}

  async require(
    userId: string,
    sessionId: string,
    executor: GradingSessionExecutor = this.db,
  ): Promise<GradingAccess> {
    const info = await this.sessions.info(sessionId, executor);
    if (!info) throw new ApiError('NOT_FOUND');
    if (info.ownerId === userId) return { info, role: 'owner' };
    const [delegate] = await this.db
      .select({ id: sessionGradingDelegates.id })
      .from(sessionGradingDelegates)
      .where(
        and(
          eq(sessionGradingDelegates.sessionId, sessionId),
          eq(sessionGradingDelegates.userId, userId),
          isNull(sessionGradingDelegates.revokedAt),
        ),
      );
    if (!delegate) throw new ApiError('NOT_FOUND');
    // Bị thêm vào Danh sách dự thi sau khi được Ủy quyền thì Ủy quyền không còn hiệu lực (Q307).
    if (await this.sessions.isInRoster(sessionId, userId, executor))
      throw new ApiError('NOT_FOUND');
    return { info, role: 'delegate' };
  }

  /** Những người xử lý Phúc khảo và nhận nhắc việc: chủ Phiên thi và người đang được Ủy quyền (nếu có). */
  async staffIds(info: GradingSessionInfo): Promise<string[]> {
    const delegates = await this.db
      .select({ userId: sessionGradingDelegates.userId })
      .from(sessionGradingDelegates)
      .where(
        and(
          eq(sessionGradingDelegates.sessionId, info.sessionId),
          isNull(sessionGradingDelegates.revokedAt),
        ),
      );
    return [info.ownerId, ...delegates.map((row) => row.userId)];
  }

  /** Chấm ẩn tên đang bật? Mặc định bật khi Phiên thi chưa có thiết lập (Q291). */
  async isBlind(sessionId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ blind: sessionGradings.blind })
      .from(sessionGradings)
      .where(eq(sessionGradings.sessionId, sessionId));
    return row?.blind ?? true;
  }
}
