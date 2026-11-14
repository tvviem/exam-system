import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import type { SupportRosterScope } from '../../common/support-roster-scope';
import { type Database, DB } from '../../db/db.module';
import { sessionRoster, sessions } from './session.schema';

/** Cài đặt cổng `SUPPORT_ROSTER_SCOPE` (Q384): Phiên thi chưa kết thúc = chưa hủy và Khung giờ chưa đóng. */
@Injectable()
export class SessionRosterScopeService implements SupportRosterScope {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async isInOpenRosterOf(examinerId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ sessionId: sessionRoster.sessionId })
      .from(sessionRoster)
      .innerJoin(sessions, eq(sessions.id, sessionRoster.sessionId))
      .where(
        and(
          eq(sessionRoster.userId, userId),
          eq(sessions.ownerId, examinerId),
          isNull(sessions.cancelledAt),
          gt(sessions.closesAt, this.clock.now()),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
}
