import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { countUpTo, type Page, paginateCapped } from '../../../common/pagination';
import { type Database, DB } from '../../../db/db.module';
import { loginEvents, users } from '../identity.schema';

export interface LoginEventFilter {
  userId?: string;
  success?: boolean;
}

@Injectable()
export class LoginEventsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Lịch sử đăng nhập, mới nhất trước (Q67). */
  list({ page, pageSize, userId, success }: Page & LoginEventFilter) {
    const conditions: SQL[] = [];
    if (userId) conditions.push(eq(loginEvents.userId, userId));
    if (success !== undefined) conditions.push(eq(loginEvents.success, success));
    const where = and(...conditions);
    return paginateCapped(
      { page, pageSize },
      (limit) => countUpTo(this.db, loginEvents, where, limit),
      (limit, offset) =>
        this.db
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
          .limit(limit)
          .offset(offset),
    );
  }
}
