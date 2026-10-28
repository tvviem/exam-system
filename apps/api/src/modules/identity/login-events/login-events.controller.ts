import { Controller, Get, Inject, Query } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { pageSchema } from '../../../common/pagination';
import { type Database, DB } from '../../../db/db.module';
import { AdminOnly } from '../auth/auth.decorators';
import { loginEvents, users } from '../identity.schema';

const listSchema = pageSchema.extend({
  userId: z.uuid().optional(),
  success: z.enum(['true', 'false']).optional(),
});

/** Lịch sử đăng nhập, mới nhất trước (Q67). Chỉ đọc nên truy vấn thẳng, không qua service. */
@AdminOnly()
@Controller('admin/login-events')
export class LoginEventsController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  async list(@Query() query: unknown) {
    const { page, pageSize, userId, success } = listSchema.parse(query ?? {});
    const conditions: SQL[] = [];
    if (userId) conditions.push(eq(loginEvents.userId, userId));
    if (success) conditions.push(eq(loginEvents.success, success === 'true'));
    const where = and(...conditions);

    const [totalRow] = await this.db.select({ total: count() }).from(loginEvents).where(where);
    const items = await this.db
      .select({
        id: loginEvents.id,
        userId: loginEvents.userId,
        userName: users.fullName,
        identifierTried: loginEvents.identifierTried,
        success: loginEvents.success,
        failureReason: loginEvents.failureReason,
        ip: loginEvents.ip,
        userAgent: loginEvents.userAgent,
        at: loginEvents.at,
      })
      .from(loginEvents)
      .leftJoin(users, eq(users.id, loginEvents.userId))
      .where(where)
      .orderBy(desc(loginEvents.at), desc(loginEvents.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { total: totalRow?.total ?? 0, page, pageSize, items };
  }
}
