import {
  isSessionFinished,
  type ReleaseBlocker,
  type ReleaseRequest,
  releaseBlockers,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import {
  GRADING_SESSIONS,
  type GradingSessionInfo,
  type GradingSessions,
} from '../../common/grading-sessions';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import { REALTIME_NOTIFIER, type RealtimeNotifier } from '../../common/realtime-notifier';
import { type Database, DB } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GradingAccessService } from './grading-access.service';
import { type GradingContext, GradingContextService } from './grading-context.service';
import { GradingStatusService } from './grading-status.service';

export interface ReleaseStatus {
  ready: boolean;
  blockers: ReleaseBlocker[];
  releasedAt: Date | null;
  appealUntil: Date | null;
  finalizedAt: Date | null;
  reviewAfterRelease: boolean;
}

/** Công bố kết quả (docs/plan/slice-5.md, PR 5c; Q298, Q299, Q301, Q303): một lần cho cả Phiên thi, không hoàn tác. */
@Injectable()
export class ReleaseService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GRADING_SESSIONS) private readonly sessions: GradingSessions,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    private readonly access: GradingAccessService,
    private readonly context: GradingContextService,
    private readonly status: GradingStatusService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(REALTIME_NOTIFIER) private readonly realtime: RealtimeNotifier,
  ) {}

  private pendingEssays(ctx: GradingContext) {
    let total = 0;
    for (const rows of ctx.rows.values()) {
      for (const row of rows) if (row.verdict === 'pending') total++;
    }
    return total;
  }

  private async blockersOf(
    info: GradingSessionInfo,
    ctx: GradingContext,
    released: boolean,
    executor?: Database,
  ) {
    const inProgress = await this.source.inProgressCount(info.sessionId, executor);
    const blockers = releaseBlockers({
      released,
      cancelled: info.cancelledAt !== null,
      finished: isSessionFinished({
        now: this.clock.now(),
        closesAt: info.closesAt,
        entryClosedAt: info.entryClosedAt,
        inProgressAttempts: inProgress,
      }),
      submittedAttempts: ctx.submitted.length,
      ungradedAttempts: ctx.ungradedAttempts,
      pendingEssays: this.pendingEssays(ctx),
    });
    return { blockers, pendingEssays: this.pendingEssays(ctx) };
  }

  /** Trạng thái Công bố cho màn Kết quả của Người ra đề: có bật được nút không, lý do chưa được, hạn Phúc khảo. */
  async statusOf(info: GradingSessionInfo, ctx: GradingContext): Promise<ReleaseStatus> {
    const state = (await this.status.releaseStates([info.sessionId])).get(info.sessionId);
    const { blockers } = await this.blockersOf(info, ctx, state !== undefined);
    return {
      ready: blockers.length === 0,
      blockers,
      releasedAt: state?.releasedAt ?? null,
      appealUntil: state?.appealUntil ?? null,
      finalizedAt: state?.finalizedAt ?? null,
      reviewAfterRelease: info.reviewAfterRelease,
    };
  }

  async release(actor: Actor, sessionId: string, request: ReleaseRequest) {
    await this.access.require(actor.id, sessionId);
    const info = await this.db.transaction(async (tx) => {
      // Khóa Phiên thi rồi dòng thiết lập chấm: nối đuôi với Hoàn tác, Hủy (khóa Phiên thi) và chấm tay (khóa dòng thiết lập).
      const locked = await this.sessions.lock(sessionId, tx);
      if (!locked) throw new ApiError('NOT_FOUND');
      const row = await this.status.lockForRelease(tx, sessionId);
      const ctx = await this.context.load(locked);
      const { blockers, pendingEssays } = await this.blockersOf(
        locked,
        ctx,
        Boolean(row?.releasedAt),
        tx as unknown as Database,
      );
      const [first] = blockers;
      if (first) {
        throw new ApiError('INVALID_STATE', { reason: first, blockers, pendingEssays });
      }
      const now = this.clock.now();
      await this.status.release(tx, sessionId, {
        releasedBy: actor.id,
        releasedAt: now,
        appealPeriodDays: request.appealPeriodDays,
      });
      await this.audit.record(
        {
          actor,
          action: 'session.released',
          entityType: 'session',
          entityId: sessionId,
          after: { appealPeriodDays: request.appealPeriodDays, attempts: ctx.submitted.length },
        },
        tx,
      );
      // Q303: mọi Người dự thi đã có Lượt nhận thông báo Kết quả đã được Công bố.
      await this.notifications.notify(
        {
          userIds: ctx.submitted.map((attempt) => attempt.userId),
          type: 'results.released',
          data: { sessionId, title: locked.title },
        },
        tx,
      );
      return locked;
    });
    this.realtime.sessionChanged(sessionId);
    const state = (await this.status.releaseStates([sessionId])).get(sessionId);
    return {
      sessionId: info.sessionId,
      releasedAt: state?.releasedAt ?? null,
      appealUntil: state?.appealUntil ?? null,
      finalizedAt: state?.finalizedAt ?? null,
    };
  }

  /** Bật hoặc tắt "Cho xem lại đề sau Công bố" (Q297); chỉ trước Công bố. */
  async setReview(actor: Actor, sessionId: string, value: boolean) {
    const { info } = await this.access.require(actor.id, sessionId);
    await this.db.transaction(async (tx) => {
      // Cùng thứ tự khóa với Công bố: dòng Phiên thi trước, dòng thiết lập chấm sau (không bế tắc).
      await this.sessions.lock(sessionId, tx);
      await this.status.lockForWrite(tx, sessionId);
      if (info.reviewAfterRelease === value) return;
      await this.sessions.setReviewAfterRelease(sessionId, value, tx);
      await this.audit.record(
        {
          actor,
          action: 'session.review_after_release_changed',
          entityType: 'session',
          entityId: sessionId,
          before: { reviewAfterRelease: info.reviewAfterRelease },
          after: { reviewAfterRelease: value },
        },
        tx,
      );
    });
    return { reviewAfterRelease: value };
  }
}
