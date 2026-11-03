import { type ExtendTimeRequest, extensionScopeOf } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { SESSION_ATTEMPTS, type SessionAttempts } from '../../common/session-attempts';
import { type Database, DB } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { lockOwnedSession } from './session-access';

/** Thao tác của Người ra đề lúc Phiên thi đang diễn ra (PR 4d): Cộng giờ, Buộc nộp, Vi phạm, Đóng cửa vào thi. */
@Injectable()
export class SessionMonitorService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SESSION_ATTEMPTS) private readonly attempts: SessionAttempts,
    private readonly audit: AuditService,
  ) {}

  /** Cộng giờ cho một Lượt, một nhóm hoặc cả phòng (Q254). Phiên thi đã đóng Khung giờ vẫn Cộng giờ được. */
  async extendTime(actor: Actor, sessionId: string, request: ExtendTimeRequest) {
    return this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, actor.id, sessionId);
      if (session.cancelledAt) throw new ApiError('INVALID_STATE', { reason: 'SESSION_CANCELLED' });
      const { replayed, ...result } = await this.attempts.extendTime(tx, {
        sessionId,
        attemptIds: request.attemptIds ?? null,
        minutes: request.minutes,
        reason: request.reason,
        batchId: request.batchId,
        by: actor.id,
        now: this.clock.now(),
      });
      if (!replayed && result.extended > 0) {
        await this.audit.record(
          {
            actor,
            action: 'session.time_extended',
            entityType: 'session',
            entityId: sessionId,
            after: {
              scope: extensionScopeOf(request.attemptIds ?? null),
              minutes: request.minutes,
              reason: request.reason,
              batchId: request.batchId,
              attempts: result.extended,
            },
          },
          tx,
        );
      }
      return result;
    });
  }
}
