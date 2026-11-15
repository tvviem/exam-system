import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, inArray, min, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { ADMIN_DIRECTORY, type AdminDirectory } from '../../common/admin-directory';
import { CLOCK, type Clock } from '../../common/clock';
import { type Database, DB } from '../../db/db.module';
import { REDIS } from '../../redis/redis.module';
import { NotificationsService } from '../notifications/notifications.service';
import { MAIL_LIMITS } from './mail.config';
import { emailOutbox } from './mail.schema';
import { type PlanLimits, planBatch, type QueuedMail, type SentMail } from './plan-batch';

const DAY_MS = 24 * 3_600_000;
/** Chuông báo khi số thư gửi trong 24 giờ trượt vượt 70 % trần (D-38, quyết định l). */
const BELL_RATIO = 0.7;
const BELL_TYPE = 'mail.quota_high';
/** Giới hạn số thư đưa vào mô phỏng lịch gửi (hàng đợi bình thường vài trăm thư). */
const MAX_SIMULATED = 3000;
/** Việt Nam là UTC+7 quanh năm: ngày lịch dùng cho "mỗi ngày tối đa một chuông". */
const vnDay = (ms: number) => Math.floor((ms + 7 * 3_600_000) / DAY_MS);

export interface QuotaSnapshot {
  sent24h: number;
  totalLimit: number;
  bulkLimit: number;
  pendingTotal: number;
  mine: { pending: number; ahead: number; estimatedDoneAt: string | null };
}

/**
 * Số liệu hạn mức thư (7d-2, K18): khung hạn mức của Người ra đề, màn Hàng đợi thư của Quản trị viên và chuông quá 70 %.
 * Lịch gửi dự kiến được mô phỏng bằng chính `planBatch` nên khớp với việc gửi thật.
 */
@Injectable()
export class MailQuotaService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MAIL_LIMITS) private readonly limits: PlanLimits,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ADMIN_DIRECTORY) private readonly admins: AdminDirectory,
    private readonly notifications: NotificationsService,
  ) {}

  /** Số thư đã gửi (hoặc đang gửi) trong 24 giờ trượt, mọi làn: đúng thứ `planBatch` đếm vào trần. */
  private async sentLast24h(now: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(emailOutbox)
      .where(
        and(
          inArray(emailOutbox.status, ['sent', 'sending']),
          gt(
            sql`coalesce(${emailOutbox.sentAt}, ${emailOutbox.lockedAt})`,
            new Date(now.getTime() - DAY_MS),
          ),
        ),
      );
    return row?.n ?? 0;
  }

  async snapshot(requesterId: string): Promise<QuotaSnapshot> {
    const now = this.clock.now();
    const sent24h = await this.sentLast24h(now);
    const queue = await this.db
      .select({
        id: emailOutbox.id,
        lane: emailOutbox.lane,
        requestedBy: emailOutbox.requestedBy,
        createdAt: emailOutbox.createdAt,
        nextAttemptAt: emailOutbox.nextAttemptAt,
      })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, 'pending'))
      .orderBy(emailOutbox.createdAt)
      .limit(MAX_SIMULATED);
    const mineIds = new Set(queue.filter((m) => m.requestedBy === requesterId).map((m) => m.id));
    const mine = { pending: mineIds.size, ahead: 0, estimatedDoneAt: null as string | null };
    if (mineIds.size > 0) {
      const schedule = await this.simulate(queue, now);
      const mineSlots = schedule.filter((s) => mineIds.has(s.id));
      mine.ahead = schedule.findIndex((s) => mineIds.has(s.id));
      const last = mineSlots[mineSlots.length - 1];
      mine.estimatedDoneAt = last ? last.at.toISOString() : null;
    }
    return {
      sent24h,
      totalLimit: this.limits.total,
      bulkLimit: this.limits.bulk,
      pendingTotal: queue.length,
      mine,
    };
  }

  /** Thứ tự và giờ gửi dự kiến của hàng đợi theo `planBatch` (không gửi thật). */
  private async simulate(queue: QueuedMail[], start: Date): Promise<{ id: string; at: Date }[]> {
    const sentRows = await this.db
      .select({
        sentAt: sql<Date>`coalesce(${emailOutbox.sentAt}, ${emailOutbox.lockedAt})`.mapWith(
          emailOutbox.sentAt,
        ),
        lane: emailOutbox.lane,
        requestedBy: emailOutbox.requestedBy,
      })
      .from(emailOutbox)
      .where(
        and(
          inArray(emailOutbox.status, ['sent', 'sending']),
          gt(
            sql`coalesce(${emailOutbox.sentAt}, ${emailOutbox.lockedAt})`,
            new Date(start.getTime() - DAY_MS),
          ),
        ),
      );
    const [first] = await this.db.select({ at: min(emailOutbox.sentAt) }).from(emailOutbox);
    const sent: SentMail[] = sentRows.map((r) => ({
      sentAt: r.sentAt,
      lane: r.lane,
      requestedBy: r.requestedBy,
    }));
    const remaining = [...queue];
    const order: { id: string; at: Date }[] = [];
    let now = start;
    for (let i = 0; i < MAX_SIMULATED * 2 && remaining.length > 0; i++) {
      const plan = planBatch({
        queue: remaining,
        sent,
        now,
        limits: this.limits,
        firstSentAt: first?.at ?? null,
      });
      if (plan.send) {
        sent.push({ sentAt: now, lane: plan.send.lane, requestedBy: plan.send.requestedBy });
        order.push({ id: plan.send.id, at: now });
        remaining.splice(remaining.indexOf(plan.send), 1);
      } else if (plan.wakeAt) {
        now = plan.wakeAt;
      } else {
        break;
      }
    }
    return order;
  }

  /** Màn Hàng đợi thư của Quản trị viên (D-39): số theo trạng thái, 24 giờ so với trần, 50 thư chưa gửi được gần nhất. KHÔNG có mã. */
  async adminQueue() {
    const now = this.clock.now();
    const rows = await this.db
      .select({ status: emailOutbox.status, n: count() })
      .from(emailOutbox)
      .groupBy(emailOutbox.status);
    const counts = { pending: 0, sending: 0, sent: 0, failed: 0, rejected: 0, skipped: 0 };
    for (const r of rows) counts[r.status] = r.n;
    const items = await this.db
      .select({
        id: emailOutbox.id,
        kind: emailOutbox.kind,
        lane: emailOutbox.lane,
        toEmail: emailOutbox.toEmail,
        status: emailOutbox.status,
        attemptCount: emailOutbox.attemptCount,
        lastError: emailOutbox.lastError,
        createdAt: emailOutbox.createdAt,
      })
      .from(emailOutbox)
      .where(inArray(emailOutbox.status, ['pending', 'sending', 'failed', 'rejected']))
      .orderBy(desc(emailOutbox.createdAt))
      .limit(50);
    return {
      sent24h: await this.sentLast24h(now),
      totalLimit: this.limits.total,
      bulkLimit: this.limits.bulk,
      counts,
      items,
    };
  }

  /**
   * Chuông cho mọi Quản trị viên khi số thư 24 giờ vượt 70 % trần; hạ xuống thì chuông chưa đọc tự gỡ. Mỗi ngày (giờ Việt Nam) tối đa
   * một chuông: đã báo hôm nay rồi (kể cả chuông đã đọc) thì không dựng lại.
   */
  async checkBell(): Promise<void> {
    const now = this.clock.now();
    const sent24h = await this.sentLast24h(now);
    const adminIds = await this.admins.activeAdminIds();
    if (adminIds.length === 0) return;
    const day = String(vnDay(now.getTime()));
    await this.db.transaction(async (tx) => {
      if (sent24h > this.limits.total * BELL_RATIO) {
        const first = await this.redis.set(`mail:quota-bell:${day}`, '1', 'EX', 2 * 86_400, 'NX');
        if (first === 'OK') {
          await this.notifications.upsertUnreadKeyed(
            {
              userIds: adminIds,
              type: BELL_TYPE,
              keyField: 'day',
              key: day,
              data: { sent24h, limit: this.limits.total },
            },
            tx,
          );
        }
      } else {
        await this.notifications.clearUnreadOfType({ userIds: adminIds, type: BELL_TYPE }, tx);
      }
    });
  }
}
