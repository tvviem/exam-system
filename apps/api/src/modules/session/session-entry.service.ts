import { leastLoadedVariant } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type {
  EntryExecutor,
  EntryGate,
  EntryVariant,
  SessionEntry,
} from '../../common/session-entry';
import { type Database, DB } from '../../db/db.module';
import {
  sessionRoster,
  sessionSectionDraws,
  sessions,
  sessionVariantItems,
  sessionVariants,
} from './session.schema';
import { SessionVariantsService } from './session-variants.service';

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
  drawScope: sessions.drawScope,
  shuffleItems: sessions.shuffleItems,
  shuffleOptions: sessions.shuffleOptions,
  showScoringRules: sessions.showScoringRules,
  extraMinutes: sessionRoster.extraMinutes,
};

/** Cài đặt cổng `SESSION_ENTRY` (Q228) cho `attempt`: Phiên thi nối với Danh sách dự thi trong một truy vấn. */
@Injectable()
export class SessionEntryService implements SessionEntry {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly variants: SessionVariantsService,
  ) {}

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

  async gateForOwner(
    sessionId: string,
    userId: string,
    executor: EntryExecutor = this.db,
  ): Promise<EntryGate | null> {
    const { extraMinutes: _own, ...columns } = gateColumns;
    const [row] = await executor
      .select(columns)
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.ownerId, userId)));
    return row ? { ...row, extraMinutes: 0 } : null;
  }

  listFor(userId: string, since: Date, executor: EntryExecutor = this.db): Promise<EntryGate[]> {
    return this.base(executor)
      .where(and(eq(sessionRoster.userId, userId), gt(sessions.closesAt, since)))
      .orderBy(desc(sessions.opensAt))
      .limit(100);
  }

  async variantTotalsOfMany(
    list: { sessionId: string; examId: string }[],
    executor: EntryExecutor = this.db,
  ) {
    const result = new Map<string, { count: number; maxCenti: number }>();
    for (const { sessionId, examId } of list) {
      const totals = await this.variants.totalsOf(executor, sessionId, examId);
      if (totals) result.set(sessionId, totals);
    }
    return result;
  }

  async previewVariant(
    sessionId: string,
    executor: EntryExecutor = this.db,
  ): Promise<EntryVariant | null> {
    const [first] = await executor
      .select({ id: sessionVariants.id })
      .from(sessionVariants)
      .where(eq(sessionVariants.sessionId, sessionId))
      .orderBy(asc(sessionVariants.number))
      .limit(1);
    if (!first) return null;
    const items = await executor
      .select({ itemId: sessionVariantItems.itemId })
      .from(sessionVariantItems)
      .where(eq(sessionVariantItems.variantId, first.id));
    return { variantId: first.id, itemIds: items.map((item) => item.itemId) };
  }

  async variantFor(
    sessionId: string,
    userId: string,
    executor: EntryExecutor,
  ): Promise<EntryVariant | null> {
    const own = () =>
      executor
        .select({ variantId: sessionRoster.variantId })
        .from(sessionRoster)
        .where(and(eq(sessionRoster.sessionId, sessionId), eq(sessionRoster.userId, userId)));
    let [row] = await own();
    let variantId = row?.variantId ?? null;
    if (!variantId) {
      const variants = await executor
        .select({ id: sessionVariants.id })
        .from(sessionVariants)
        .where(eq(sessionVariants.sessionId, sessionId))
        .orderBy(asc(sessionVariants.number));
      if (variants.length === 0) return null;
      // Một Mã đề: không cần chia nên không khóa. Nhiều Mã đề: khóa cố vấn theo Phiên thi đến hết giao dịch rồi đếm lại, để hai
      // người vào cùng lúc không cùng thấy một Mã đề "ít người nhất".
      if (variants.length > 1) {
        await executor.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${sessionId}, 462))`,
        );
        [row] = await own();
        variantId = row?.variantId ?? null;
      }
      if (!variantId) {
        const counts = await executor
          .select({ id: sessionRoster.variantId, n: count() })
          .from(sessionRoster)
          .where(eq(sessionRoster.sessionId, sessionId))
          .groupBy(sessionRoster.variantId);
        const loads = variants.map((v) => Number(counts.find((c) => c.id === v.id)?.n ?? 0));
        variantId = (variants[leastLoadedVariant(loads)] as { id: string }).id;
        await executor
          .update(sessionRoster)
          .set({ variantId })
          .where(and(eq(sessionRoster.sessionId, sessionId), eq(sessionRoster.userId, userId)));
      }
    }
    const items = await executor
      .select({ itemId: sessionVariantItems.itemId })
      .from(sessionVariantItems)
      .where(eq(sessionVariantItems.variantId, variantId));
    return { variantId, itemIds: items.map((item) => item.itemId) };
  }

  async drawOverridesOf(
    sessionId: string,
    executor: EntryExecutor = this.db,
  ): Promise<Record<string, number>> {
    const rows = await executor
      .select({ sectionId: sessionSectionDraws.sectionId, percent: sessionSectionDraws.percent })
      .from(sessionSectionDraws)
      .where(eq(sessionSectionDraws.sessionId, sessionId));
    return Object.fromEntries(rows.map((row) => [row.sectionId, Number(row.percent)]));
  }

  async drawOverridesOfMany(sessionIds: string[], executor: EntryExecutor = this.db) {
    const result = new Map<string, Record<string, number>>();
    if (sessionIds.length === 0) return result;
    const rows = await executor
      .select()
      .from(sessionSectionDraws)
      .where(inArray(sessionSectionDraws.sessionId, sessionIds));
    for (const row of rows) {
      const map = result.get(row.sessionId) ?? {};
      map[row.sectionId] = Number(row.percent);
      result.set(row.sessionId, map);
    }
    return result;
  }
}
