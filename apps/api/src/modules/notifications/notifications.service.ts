import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import { type Database, DB } from '../../db/db.module';
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
