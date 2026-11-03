import {
  type ExtendTimeRequest,
  extensionScopeOf,
  type ForceSubmitRequest,
  type ViolationRequest,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { SESSION_ATTEMPTS, type SessionAttempts } from '../../common/session-attempts';
import { type Database, DB } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { sessions } from './session.schema';
import { lockOwnedSession, requireNotOver } from './session-access';

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

  /** Buộc nộp một Lượt, một nhóm hoặc cả phòng (Q254). Làm lại cùng yêu cầu không đổi gì thêm. */
  async forceSubmit(actor: Actor, sessionId: string, request: ForceSubmitRequest) {
    return this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, actor.id, sessionId);
      if (session.cancelledAt) throw new ApiError('INVALID_STATE', { reason: 'SESSION_CANCELLED' });
      const result = await this.attempts.forceSubmit(tx, {
        sessionId,
        attemptIds: request.attemptIds ?? null,
        now: this.clock.now(),
      });
      if (result.closed > 0) {
        await this.audit.record(
          {
            actor,
            action: 'session.force_submitted',
            entityType: 'session',
            entityId: sessionId,
            after: { scope: extensionScopeOf(request.attemptIds ?? null), attempts: result.closed },
          },
          tx,
        );
      }
      return result;
    });
  }

  /** Cảnh cáo (vẫn làm tiếp) hoặc Đình chỉ (nộp ngay) một Lượt đang làm, bắt buộc lý do (Q259). */
  async recordViolation(
    actor: Actor,
    sessionId: string,
    attemptId: string,
    request: ViolationRequest,
  ) {
    return this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, actor.id, sessionId);
      if (session.cancelledAt) throw new ApiError('INVALID_STATE', { reason: 'SESSION_CANCELLED' });
      const { id, userId } = await this.attempts.recordViolation(tx, {
        sessionId,
        attemptId,
        action: request.action,
        reason: request.reason,
        by: actor.id,
        now: this.clock.now(),
      });
      await this.audit.record(
        {
          actor,
          action: 'session.violation_recorded',
          entityType: 'session',
          entityId: sessionId,
          after: { attemptId, userId, action: request.action, reason: request.reason },
        },
        tx,
      );
      return { id };
    });
  }

  /** Đóng cửa vào thi (GLOSSARY): chặn Lượt mới, người đang làm tiếp tục. Làm lại không đổi giờ đã đóng. */
  async closeEntry(actor: Actor, sessionId: string) {
    return this.setEntryClosed(actor, sessionId, true);
  }

  /** Mở lại cửa vào thi (Q258) khi Khung giờ chưa đóng. */
  async reopenEntry(actor: Actor, sessionId: string) {
    return this.setEntryClosed(actor, sessionId, false);
  }

  private async setEntryClosed(actor: Actor, sessionId: string, closed: boolean) {
    return this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, actor.id, sessionId);
      const now = this.clock.now();
      requireNotOver(session, now);
      const next = closed ? (session.entryClosedAt ?? now) : null;
      if (next?.getTime() !== session.entryClosedAt?.getTime()) {
        await tx.update(sessions).set({ entryClosedAt: next }).where(eq(sessions.id, sessionId));
        await this.audit.record(
          {
            actor,
            action: closed ? 'session.entry_closed' : 'session.entry_reopened',
            entityType: 'session',
            entityId: sessionId,
          },
          tx,
        );
      }
      return { entryClosedAt: next };
    });
  }
}
