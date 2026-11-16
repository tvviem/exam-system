import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
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

  async inOpenRosterAmong(examinerId: string, userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ userId: sessionRoster.userId })
      .from(sessionRoster)
      .innerJoin(sessions, eq(sessions.id, sessionRoster.sessionId))
      .where(
        and(
          inArray(sessionRoster.userId, userIds),
          eq(sessions.ownerId, examinerId),
          isNull(sessions.cancelledAt),
          gt(sessions.closesAt, this.clock.now()),
        ),
      );
    return new Set(rows.map((r) => r.userId));
  }

  async rosterUserIds(sessionId: string, ownerId: string | null): Promise<string[] | null> {
    const [session] = await this.db
      .select({ ownerId: sessions.ownerId })
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    if (!session || (ownerId !== null && session.ownerId !== ownerId)) return null;
    const rows = await this.db
      .select({ userId: sessionRoster.userId })
      .from(sessionRoster)
      .where(eq(sessionRoster.sessionId, sessionId));
    return rows.map((r) => r.userId);
  }
}
