import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { notifications } from './notifications.schema';

const LIST_LIMIT = 50;

export interface NewNotification {
  userIds: string[];
  type: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Gửi cùng một thông báo cho nhiều người; có thể nằm trong transaction của bên gọi. */
  async notify(
    { userIds, type, data = {} }: NewNotification,
    tx: Pick<Database, 'insert'> = this.db,
  ): Promise<void> {
    const recipients = [...new Set(userIds)];
    if (recipients.length === 0) return;
    const createdAt = this.clock.now();
    await tx
      .insert(notifications)
      .values(recipients.map((userId) => ({ userId, type, data, createdAt })));
  }

  /**
   * Gộp chuông theo Phiên thi (Q303): nếu người đó còn một thông báo cùng `type` về cùng Phiên thi chưa đọc thì cập nhật nội dung
   * (số mới) và đưa lên đầu thay vì thêm dòng; chưa có thì thêm. 500 Phúc khảo cùng lúc không làm ngập chuông.
   */
  async upsertUnread(
    {
      userIds,
      type,
      sessionId,
      data,
    }: { userIds: string[]; type: string; sessionId: string; data: Record<string, unknown> },
    tx: Transaction,
  ): Promise<void> {
    const now = this.clock.now();
    const body = { ...data, sessionId };
    for (const userId of [...new Set(userIds)]) {
      // Khóa tư vấn theo (người, loại, Phiên thi): hai Phúc khảo cùng lúc không tạo hai dòng.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${type}:${sessionId}`}, 0))`,
      );
      const updated = await tx
        .update(notifications)
        .set({ data: body, createdAt: now })
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.type, type),
            isNull(notifications.readAt),
            sql`${notifications.data}->>'sessionId' = ${sessionId}`,
          ),
        )
        .returning({ id: notifications.id });
      if (updated.length === 0) {
        await tx.insert(notifications).values({ userId, type, data: body, createdAt: now });
      }
    }
  }

  /** Đánh dấu đã đọc các thông báo chưa đọc cùng loại và Phiên thi (khi việc đã xong, ví dụ hết Phúc khảo chờ). */
  async clearUnread(
    { userIds, type, sessionId }: { userIds: string[]; type: string; sessionId: string },
    tx: Transaction,
  ): Promise<void> {
    if (userIds.length === 0) return;
    await tx
      .update(notifications)
      .set({ readAt: this.clock.now() })
      .where(
        and(
          inArray(notifications.userId, [...new Set(userIds)]),
          eq(notifications.type, type),
          isNull(notifications.readAt),
          sql`${notifications.data}->>'sessionId' = ${sessionId}`,
        ),
      );
  }

  /** 50 thông báo mới nhất của một người, kèm tổng số chưa đọc. */
  async listFor(userId: string) {
    const [unread] = await this.db
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    const items = await this.db
      .select({
        id: notifications.id,
        type: notifications.type,
        data: notifications.data,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(LIST_LIMIT);
    return { unreadCount: unread?.total ?? 0, items };
  }

  /** Đánh dấu đã đọc; chỉ tác động tới thông báo của chính `userId`. `ids` rỗng/không có = tất cả. */
  async markRead(userId: string, ids?: string[]): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: this.clock.now() })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          ids && ids.length > 0 ? inArray(notifications.id, ids) : undefined,
        ),
      );
  }
}
