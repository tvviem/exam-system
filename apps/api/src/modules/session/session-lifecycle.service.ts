import { SESSION_TITLE_MAX, type SessionSettings } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { type Database, DB } from '../../db/db.module';
import { NotificationsService } from '../notifications/notifications.service';
import { sessions } from './session.schema';
import { lockOwnedSession, notifyRoster } from './session-access';
import { SessionsService } from './sessions.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COPY_SUFFIX = ' (bản sao)';

/** Hủy, Xóa và Nhân bản Phiên thi (Q202, Q203). */
@Injectable()
export class SessionLifecycleService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Hủy không hoàn tác (Q203). Các Lượt đang làm sẽ được nộp tự động từ PR 4b khi có Lượt làm bài. */
  async cancel(ownerId: string, id: string, reason: string | undefined) {
    await this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, ownerId, id);
      if (session.cancelledAt) throw new ApiError('INVALID_STATE', { reason: 'SESSION_CANCELLED' });
      await tx
        .update(sessions)
        .set({
          cancelledAt: this.clock.now(),
          cancelledBy: ownerId,
          cancelReason: reason || null,
          version: sql`${sessions.version} + 1`,
        })
        .where(eq(sessions.id, id));
      await notifyRoster(this.notifications, tx, id, 'session.cancelled', {
        sessionId: id,
        title: session.title,
        reason: reason || null,
      });
    });
    return this.sessions.get(ownerId, id);
  }

  /** Xóa Phiên thi (kèm Danh sách). Chưa Hủy mà đã có người trong Danh sách thì báo như Hủy. */
  async remove(ownerId: string, id: string) {
    await this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, ownerId, id);
      if (!session.cancelledAt) {
        await notifyRoster(this.notifications, tx, id, 'session.cancelled', {
          sessionId: id,
          title: session.title,
          reason: null,
        });
      }
      await tx.delete(sessions).where(eq(sessions.id, id));
    });
  }

  /**
   * Nhân bản thiết lập và Danh sách (người còn đủ điều kiện), Lớp và giờ cộng sẵn giữ theo hồ sơ hiện tại. Giờ dời sang
   * tuần sau (hoặc đủ số tuần để còn ở tương lai); mã mới; tên thêm "(bản sao)".
   */
  async duplicate(ownerId: string, id: string) {
    const newId = await this.db.transaction(async (tx) => {
      const source = await lockOwnedSession(tx, ownerId, id);
      const now = this.clock.now().getTime();
      const weeks = Math.max(1, Math.ceil((now - source.opensAt.getTime()) / WEEK_MS));
      const shift = weeks * WEEK_MS;
      const room = SESSION_TITLE_MAX - COPY_SUFFIX.length;
      const input: SessionSettings = {
        examId: source.examId,
        title: `${source.title.slice(0, room)}${COPY_SUFFIX}`,
        opensAt: new Date(source.opensAt.getTime() + shift),
        closesAt: new Date(source.closesAt.getTime() + shift),
        durationMinutes: source.durationMinutes,
        hardClose: source.hardClose,
        maxAttempts: source.maxAttempts,
        attemptScoring: source.attemptScoring,
        shuffleItems: source.shuffleItems,
        shuffleOptions: source.shuffleOptions,
        showScoringRules: source.showScoringRules,
      };
      const created = await this.sessions.createWithin(tx, ownerId, input);
      const copied = await tx.execute<{ user_id: string }>(sql`
        insert into session_roster (session_id, user_id, added_by, class_label, extra_minutes)
        select ${created}, r.user_id, ${ownerId}, u.class_label, r.extra_minutes
        from session_roster r
        join users u on u.id = r.user_id
        where r.session_id = ${id}
          and u.removed_at is null
          and u.status = 'active'
          and u.id <> ${ownerId}
          and exists (select 1 from user_role_tags t where t.user_id = u.id and t.tag = 'candidate')
        returning user_id`);
      await this.notifications.notify(
        {
          userIds: copied.rows.map((row) => row.user_id),
          type: 'session.added',
          data: {
            sessionId: created,
            title: input.title,
            opensAt: input.opensAt,
            closesAt: input.closesAt,
          },
        },
        tx,
      );
      return created;
    });
    return this.sessions.get(ownerId, newId);
  }
}
