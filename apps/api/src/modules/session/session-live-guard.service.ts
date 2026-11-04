import { sessionActivityOf } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, or } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import type { LiveSessionGuard, LiveSessionRef } from '../../common/live-session-guard';
import { SESSION_ATTEMPTS, type SessionAttempts } from '../../common/session-attempts';
import { type Database, DB } from '../../db/db.module';
import { sessions } from './session.schema';

/** Cài đặt cổng `LIVE_SESSION_GUARD` (Q264, Q271): chủ của Phiên thi đang diễn ra, hoặc người có Lượt đang làm. */
@Injectable()
export class SessionLiveGuardService implements LiveSessionGuard {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SESSION_ATTEMPTS) private readonly attempts: SessionAttempts,
  ) {}

  async liveSessionsOf(
    userId: string,
    executor: Pick<Database, 'select'> = this.db,
  ): Promise<LiveSessionRef[]> {
    const candidateIn = await this.attempts.sessionIdsWithInProgressOf(userId, executor);
    const rows = await executor
      .select()
      .from(sessions)
      .where(
        candidateIn.length > 0
          ? or(eq(sessions.ownerId, userId), inArray(sessions.id, candidateIn))
          : eq(sessions.ownerId, userId),
      );
    const running = await this.attempts.inProgressCounts(
      rows.map((row) => row.id),
      executor,
    );
    const candidateSet = new Set(candidateIn);
    const now = this.clock.now();
    return rows
      .filter(
        (row) =>
          sessionActivityOf(row, now, (running.get(row.id) ?? 0) > 0) === 'live' &&
          (row.ownerId === userId || candidateSet.has(row.id)),
      )
      .map((row) => ({
        id: row.id,
        title: row.title,
        opensAt: row.opensAt,
        closesAt: row.closesAt,
        ownerId: row.ownerId,
        inProgress: running.get(row.id) ?? 0,
        relation: row.ownerId === userId ? ('owner' as const) : ('candidate' as const),
      }))
      .sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime() || a.id.localeCompare(b.id));
  }
}
