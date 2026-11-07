import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import { GRADING_SESSIONS, type GradingSessions } from '../../common/grading-sessions';
import { REALTIME_NOTIFIER, type RealtimeNotifier } from '../../common/realtime-notifier';
import { type Database, DB } from '../../db/db.module';
import { NotificationsService } from '../notifications/notifications.service';
import { appeals, sessionGradings } from './grading.schema';
import { GradingAccessService } from './grading-access.service';
import { appealDeadlineOf } from './grading-status.service';

const SWEEP_LIMIT = 200;
const DAY_MS = 86_400_000;

/**
 * Chốt kết quả và nhắc Phúc khảo bị bỏ quên (docs/plan/slice-5.md, PR 5d-1; Q301, Q315). Job `grading.finalize` chạy mỗi phút;
 * xử lý xong Phúc khảo cuối sau hạn thì `AppealsService` gọi `tryFinalize` ngay, không chờ job.
 */
@Injectable()
export class AppealFinalizeService {
  private readonly logger = new Logger(AppealFinalizeService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GRADING_SESSIONS) private readonly sessions: GradingSessions,
    @Inject(REALTIME_NOTIFIER) private readonly realtime: RealtimeNotifier,
    private readonly access: GradingAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Chốt nếu đã hết hạn và không còn Phúc khảo chờ. Khóa độc quyền dòng thiết lập chấm nên nối đuôi với gửi, xử lý Phúc khảo (khóa
   * chia sẻ) và gia hạn: không Phúc khảo nào lọt qua giữa lúc kiểm và Chốt.
   */
  async tryFinalize(sessionId: string): Promise<boolean> {
    const now = this.clock.now();
    const done = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(sessionGradings)
        .where(eq(sessionGradings.sessionId, sessionId))
        .for('update');
      if (!row?.releasedAt || row.finalizedAt) return false;
      const until = appealDeadlineOf(row.releasedAt, row.appealPeriodHours ?? 0);
      if (until && until.getTime() > now.getTime()) return false;
      const [open] = await tx
        .select({ total: count() })
        .from(appeals)
        .where(and(eq(appeals.sessionId, sessionId), eq(appeals.status, 'open')));
      if ((open?.total ?? 0) > 0) return false;
      await tx
        .update(sessionGradings)
        .set({ finalizedAt: now, updatedAt: now })
        .where(eq(sessionGradings.sessionId, sessionId));
      return true;
    });
    if (done) this.realtime.sessionChanged(sessionId);
    return done;
  }

  /** Một lượt quét: Chốt các Phiên thi đủ điều kiện, rồi nhắc những Phiên thi quá hạn mà còn Phúc khảo chờ. */
  async sweep(): Promise<{ finalized: number; reminded: number }> {
    const now = this.clock.now();
    const overdue = and(
      isNotNull(sessionGradings.releasedAt),
      isNull(sessionGradings.finalizedAt),
      sql`${sessionGradings.releasedAt} + make_interval(hours => ${sessionGradings.appealPeriodHours}) <= ${now}`,
    );
    const due = await this.db
      .select({ sessionId: sessionGradings.sessionId })
      .from(sessionGradings)
      .where(overdue)
      .limit(SWEEP_LIMIT);
    let finalized = 0;
    for (const { sessionId } of due) {
      if (await this.tryFinalize(sessionId)) finalized++;
    }

    // Quá hạn mà còn Phúc khảo chờ (chưa Chốt được): nhắc lúc hết hạn rồi mỗi 24 giờ (Q315); không tự bác.
    const stale = new Date(now.getTime() - DAY_MS);
    const waiting = await this.db
      .select({ sessionId: sessionGradings.sessionId })
      .from(sessionGradings)
      .where(
        and(
          overdue,
          or(
            isNull(sessionGradings.appealRemindedAt),
            sql`${sessionGradings.appealRemindedAt} <= ${stale}`,
          ),
          sql`exists (select 1 from ${appeals} where ${appeals.sessionId} = ${sessionGradings.sessionId} and ${appeals.status} = 'open')`,
        ),
      )
      .limit(SWEEP_LIMIT);
    let reminded = 0;
    for (const { sessionId } of waiting) {
      if (await this.remind(sessionId, now)) reminded++;
    }
    if (finalized > 0 || reminded > 0) {
      this.logger.log(`Job Chốt: Chốt ${finalized} Phiên thi, nhắc ${reminded} Phiên thi`);
    }
    return { finalized, reminded };
  }

  private async remind(sessionId: string, now: Date): Promise<boolean> {
    const info = await this.sessions.info(sessionId);
    if (!info) return false;
    const staff = await this.access.staffIds(info);
    const stale = new Date(now.getTime() - DAY_MS);
    return this.db.transaction(async (tx) => {
      // Khóa dòng thiết lập chấm: hai lượt quét chồng nhau chỉ có một lượt nhắc.
      const [row] = await tx
        .select()
        .from(sessionGradings)
        .where(eq(sessionGradings.sessionId, sessionId))
        .for('update');
      if (!row || row.finalizedAt) return false;
      if (row.appealRemindedAt && row.appealRemindedAt.getTime() > stale.getTime()) return false;
      const [open] = await tx
        .select({ total: count() })
        .from(appeals)
        .where(and(eq(appeals.sessionId, sessionId), eq(appeals.status, 'open')));
      if (!open || open.total === 0) return false;
      await this.notifications.upsertUnread(
        {
          userIds: staff,
          type: 'appeal.overdue',
          sessionId,
          data: { title: info.title, count: open.total },
        },
        tx,
      );
      await tx
        .update(sessionGradings)
        .set({ appealRemindedAt: now })
        .where(eq(sessionGradings.sessionId, sessionId));
      return true;
    });
  }
}
