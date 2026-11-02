import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { EntryExecutor, EntryGate, SessionEntry } from '../../common/session-entry';
import { type Database, DB } from '../../db/db.module';
import { sessionRoster, sessions } from './session.schema';

const gateColumns = {
  sessionId: sessions.id,
  examId: sessions.examId,
  title: sessions.title,
  opensAt: sessions.opensAt,
  closesAt: sessions.closesAt,
  entryClosedAt: sessions.entryClosedAt,
  cancelledAt: sessions.cancelledAt,
  durationMinutes: sessions.durationMinutes,
  hardClose: sessions.hardClose,
  maxAttempts: sessions.maxAttempts,
  shuffleItems: sessions.shuffleItems,
  shuffleOptions: sessions.shuffleOptions,
  showScoringRules: sessions.showScoringRules,
  extraMinutes: sessionRoster.extraMinutes,
};

/** Cài đặt cổng `SESSION_ENTRY` (Q228) cho `attempt`: Phiên thi nối với Danh sách dự thi trong một truy vấn. */
@Injectable()
export class SessionEntryService implements SessionEntry {
  constructor(@Inject(DB) private readonly db: Database) {}

  private base(executor: EntryExecutor) {
    return executor
      .select(gateColumns)
      .from(sessions)
      .innerJoin(sessionRoster, eq(sessionRoster.sessionId, sessions.id));
  }

  findByCode(
    userId: string,
    code: string,
    executor: EntryExecutor = this.db,
  ): Promise<EntryGate[]> {
    return this.base(executor)
      .where(and(eq(sessionRoster.userId, userId), eq(sessions.accessCode, code)))
      .orderBy(desc(sessions.opensAt))
      .limit(20);
  }

  async gateFor(
    sessionId: string,
    userId: string,
    executor: EntryExecutor = this.db,
    options: { lock?: boolean } = {},
  ): Promise<EntryGate | null> {
    const query = this.base(executor).where(
      and(eq(sessions.id, sessionId), eq(sessionRoster.userId, userId)),
    );
    const [row] = await (options.lock ? query.for('share', { of: sessions }) : query);
    return row ?? null;
  }

  listFor(userId: string, since: Date, executor: EntryExecutor = this.db): Promise<EntryGate[]> {
    return this.base(executor)
      .where(and(eq(sessionRoster.userId, userId), gt(sessions.closesAt, since)))
      .orderBy(desc(sessions.opensAt))
      .limit(100);
  }
}
