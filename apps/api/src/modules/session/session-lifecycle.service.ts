import { SESSION_TITLE_MAX, type SessionSettings } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { CANDIDATE_DIRECTORY, type CandidateDirectory } from '../../common/candidate-directory';
import { CLOCK, type Clock } from '../../common/clock';
import { REALTIME_NOTIFIER, type RealtimeNotifier } from '../../common/realtime-notifier';
import { SESSION_ATTEMPTS, type SessionAttempts } from '../../common/session-attempts';
import { type Database, DB } from '../../db/db.module';
import { NotificationsService } from '../notifications/notifications.service';
import { sessionRoster, sessions } from './session.schema';
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
    @Inject(CANDIDATE_DIRECTORY) private readonly directory: CandidateDirectory,
    @Inject(SESSION_ATTEMPTS) private readonly attempts: SessionAttempts,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsService,
    @Inject(REALTIME_NOTIFIER) private readonly realtime: RealtimeNotifier,
  ) {}

  /** Hủy không hoàn tác (Q203); các Lượt đang làm được nộp ngay với lý do `session_cancelled`. */
  async cancel(ownerId: string, id: string, reason: string | undefined) {
    // Lấy các Lượt đang làm trước khi bị đóng, để báo Người dự thi ngay thay vì chờ heartbeat kế tiếp.
    const live = await this.attempts.liveAttemptIds(id);
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
      // Q203: mọi Lượt đang làm được nộp ngay trong cùng giao dịch.
      await this.attempts.closeAll(tx, id, 'session_cancelled');
      await notifyRoster(this.notifications, tx, id, 'session.cancelled', {
        sessionId: id,
        title: session.title,
        reason: reason || null,
      });
    });
    this.realtime.affected(id, live);
    return this.sessions.get(ownerId, id);
  }

  /** Xóa Phiên thi (kèm Danh sách). Chưa Hủy mà đã có người trong Danh sách thì báo như Hủy. */
  async remove(ownerId: string, id: string) {
    await this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, ownerId, id);
      // Q202: chỉ xóa khi chưa từng có Lượt làm bài; còn lại Hủy để giữ bài đã làm.
      if (await this.attempts.hasAttempts(id, tx)) {
        throw new ApiError('INVALID_STATE', { reason: 'HAS_ATTEMPTS' });
      }
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
      // Chỉ chép người còn đủ điều kiện dự thi; Lớp chụp lại theo hồ sơ hiện tại (như lúc thêm).
      const members = await tx
        .select({ userId: sessionRoster.userId, extraMinutes: sessionRoster.extraMinutes })
        .from(sessionRoster)
        .where(eq(sessionRoster.sessionId, id));
      const eligible = new Map(
        (
          await this.directory.eligibleAmong(
            members.map((member) => member.userId),
            ownerId,
            tx,
          )
        ).map((person) => [person.id, person.classLabel]),
      );
      const copied = members.filter((member) => eligible.has(member.userId));
      if (copied.length > 0) {
        await tx.insert(sessionRoster).values(
          copied.map((member) => ({
            sessionId: created,
            userId: member.userId,
            addedBy: ownerId,
            classLabel: eligible.get(member.userId) ?? null,
            extraMinutes: member.extraMinutes,
          })),
        );
      }
      await this.notifications.notify(
        {
          userIds: copied.map((member) => member.userId),
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
