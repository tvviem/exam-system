import {
  attentionReasonsOf,
  deviceStateOf,
  type ExtendTimeRequest,
  extensionScopeOf,
  type ForceSubmitRequest,
  monitorStateOf,
  type ViolationRequest,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import { CANDIDATE_DIRECTORY, type CandidateDirectory } from '../../common/candidate-directory';
import { CLOCK, type Clock } from '../../common/clock';
import { SESSION_ATTEMPTS, type SessionAttempts } from '../../common/session-attempts';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { sessionRoster, sessions } from './session.schema';
import { findOwnedSession, lockOwnedSession, requireNotOver } from './session-access';

/** Thao tác của Người ra đề lúc Phiên thi đang diễn ra (PR 4d): Cộng giờ, Buộc nộp, Vi phạm, Đóng cửa vào thi. */
@Injectable()
export class SessionMonitorService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SESSION_ATTEMPTS) private readonly attempts: SessionAttempts,
    @Inject(CANDIDATE_DIRECTORY) private readonly directory: CandidateDirectory,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ảnh chụp cả phòng cho màn Theo dõi (Q252, Q253): trạng thái từng người, tiến độ, thiết bị và dấu hiệu Cần chú ý.
   * Mở lại màn hình trên thiết bị khác hay sau khi mất mạng đều gọi lại hàm này để có đủ trạng thái. Không mang đáp án.
   */
  async monitor(ownerId: string, sessionId: string) {
    const session = await findOwnedSession(this.db, ownerId, sessionId);
    const members = await this.db
      .select({ userId: sessionRoster.userId, classLabel: sessionRoster.classLabel })
      .from(sessionRoster)
      .where(eq(sessionRoster.sessionId, sessionId));
    const now = this.clock.now();
    const classOf = new Map(members.map((member) => [member.userId, member.classLabel]));
    const [profiles, live, devices] = await Promise.all([
      members.length === 0
        ? { items: [] }
        : this.directory.page([...classOf.keys()], {
            sort: 'name',
            limit: members.length,
            offset: 0,
          }),
      this.attempts.monitorAttempts(sessionId, session.examId),
      this.attempts.devicesOf(sessionId),
    ]);
    const summary = {
      total: 0,
      notStarted: 0,
      working: 0,
      disconnected: 0,
      submitted: 0,
      suspended: 0,
      attention: 0,
    };
    const counter = {
      not_started: 'notStarted',
      working: 'working',
      disconnected: 'disconnected',
      submitted: 'submitted',
      suspended: 'suspended',
    } as const;
    const people = profiles.items.map((profile) => {
      const attempt = live.byUser.get(profile.id);
      const own = devices.get(profile.id) ?? [];
      const device = deviceStateOf(own, attempt?.startedAt ?? null);
      // Thiết bị bị Thu hồi gần nhất: đích của "Hoàn tác Thu hồi" (đưa máy cũ vào lại, máy đang gắn bị thu hồi thay).
      const revokedDeviceId =
        own
          .filter((item) => item.status === 'revoked')
          .sort((a, b) => (b.revokedAt?.getTime() ?? 0) - (a.revokedAt?.getTime() ?? 0))[0]
          ?.deviceId ?? null;
      const reasons = attempt
        ? attentionReasonsOf({
            inProgress: attempt.status === 'in_progress',
            startedAt: attempt.startedAt,
            deadline: attempt.deadline,
            now,
            lastSeenAt: attempt.lastSeenAt,
            hiddenCount: attempt.hiddenCount,
            device,
            answeredFraction: live.totalItems > 0 ? attempt.answered / live.totalItems : 0,
          })
        : [];
      const state = monitorStateOf(attempt ?? null, now);
      summary.total += 1;
      summary[counter[state]] += 1;
      if (reasons.length > 0) summary.attention += 1;
      return {
        userId: profile.id,
        code: profile.code,
        fullName: profile.fullName,
        classLabel: classOf.get(profile.id) ?? null,
        state,
        attemptId: attempt?.attemptId ?? null,
        attemptNo: attempt?.attemptNo ?? null,
        startedAt: attempt?.startedAt ?? null,
        deadline: attempt?.deadline ?? null,
        submittedAt: attempt?.submittedAt ?? null,
        submitReason: attempt?.submitReason ?? null,
        answered: attempt?.answered ?? 0,
        hiddenCount: attempt?.hiddenCount ?? 0,
        warnings: attempt?.warnings ?? 0,
        device,
        revokedDeviceId,
        reasons,
      };
    });
    return { serverNow: now, totalItems: live.totalItems, summary, people };
  }

  /** Cộng giờ cho một Lượt, một nhóm hoặc cả phòng (Q254). Phiên thi đã đóng Khung giờ vẫn Cộng giờ được. */
  async extendTime(actor: Actor, sessionId: string, request: ExtendTimeRequest) {
    return this.db.transaction(async (tx) => {
      await this.lockLiveSession(tx, actor, sessionId);
      const { replayed, attemptIds, ...result } = await this.attempts.extendTime(tx, {
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
              attemptIds,
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
      await this.lockLiveSession(tx, actor, sessionId);
      const { closedIds, ...result } = await this.attempts.forceSubmit(tx, {
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
            after: { scope: extensionScopeOf(request.attemptIds ?? null), attemptIds: closedIds },
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
      await this.lockLiveSession(tx, actor, sessionId);
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

  /** Khóa Phiên thi của Người ra đề; Phiên thi đã hủy thì không thao tác được nữa. */
  private async lockLiveSession(tx: Transaction, actor: Actor, sessionId: string) {
    const session = await lockOwnedSession(tx, actor.id, sessionId);
    if (session.cancelledAt) throw new ApiError('INVALID_STATE', { reason: 'SESSION_CANCELLED' });
    return session;
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
