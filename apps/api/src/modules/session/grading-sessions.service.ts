import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  GradingSessionExecutor,
  GradingSessionInfo,
  GradingSessions,
} from '../../common/grading-sessions';
import { escapeLike } from '../../common/sql-like';
import { type Database, DB } from '../../db/db.module';
import { sessionRoster, sessionSectionDraws, sessions } from './session.schema';
import { SessionVariantsService } from './session-variants.service';

const toInfo = (
  row: typeof sessions.$inferSelect,
  overrides: Record<string, number> = {},
  variantTotals: GradingSessionInfo['variantTotals'] = null,
): GradingSessionInfo => ({
  sessionId: row.id,
  examId: row.examId,
  title: row.title,
  ownerId: row.ownerId,
  opensAt: row.opensAt,
  closesAt: row.closesAt,
  durationMinutes: row.durationMinutes,
  attemptScoring: row.attemptScoring,
  entryClosedAt: row.entryClosedAt,
  cancelledAt: row.cancelledAt,
  reviewAfterRelease: row.reviewAfterRelease,
  drawOverrides: overrides,
  variantTotals,
});

/** Ghi đè tỷ lệ rút của các Phiên thi này (một truy vấn): `sessionId` → (`sectionId` → tỷ lệ). */
async function overridesOf(executor: GradingSessionExecutor, sessionIds: string[]) {
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

/** Gắn ghi đè tỷ lệ rút và (Phiên thi dùng chung Mã đề) tổng của Mã đề vào từng Phiên thi. */
async function withOverrides(
  executor: GradingSessionExecutor,
  rows: (typeof sessions.$inferSelect)[],
  variants: SessionVariantsService,
): Promise<GradingSessionInfo[]> {
  const overrides = await overridesOf(
    executor,
    rows.map((row) => row.id),
  );
  return Promise.all(
    rows.map(async (row) =>
      toInfo(
        row,
        overrides.get(row.id),
        row.drawScope === 'shared' ? await variants.totalsOf(executor, row.id, row.examId) : null,
      ),
    ),
  );
}

/** Cài đặt cổng `GRADING_SESSIONS` (docs/plan/slice-5.md, PR 5b). */
@Injectable()
export class GradingSessionsService implements GradingSessions {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly variants: SessionVariantsService,
  ) {}

  async info(sessionId: string, executor: GradingSessionExecutor = this.db) {
    const [row] = await executor.select().from(sessions).where(eq(sessions.id, sessionId));
    return row ? ((await withOverrides(executor, [row], this.variants))[0] ?? null) : null;
  }

  async lock(sessionId: string, executor: GradingSessionExecutor) {
    const [row] = await executor
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      // NO KEY UPDATE vẫn loại trừ Hoàn tác, Hủy (FOR UPDATE) nhưng không chặn chèn dòng thiết lập chấm (khóa ngoại): tránh bế tắc.
      .for('no key update');
    return row ? ((await withOverrides(executor, [row], this.variants))[0] ?? null) : null;
  }

  async setReviewAfterRelease(sessionId: string, value: boolean, executor: GradingSessionExecutor) {
    await executor
      .update(sessions)
      .set({ reviewAfterRelease: value, version: sql`${sessions.version} + 1` })
      .where(eq(sessions.id, sessionId));
  }

  async byExam(examId: string, executor: GradingSessionExecutor = this.db) {
    const rows = await executor
      .select()
      .from(sessions)
      .where(eq(sessions.examId, examId))
      .orderBy(desc(sessions.opensAt));
    return withOverrides(executor, rows, this.variants);
  }

  async infoMany(sessionIds: string[]) {
    if (sessionIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(sessions)
      .where(inArray(sessions.id, sessionIds))
      .orderBy(desc(sessions.opensAt));
    return withOverrides(this.db, rows, this.variants);
  }

  async roster(sessionId: string, executor: GradingSessionExecutor = this.db) {
    const members = await executor
      .select({ userId: sessionRoster.userId, classLabel: sessionRoster.classLabel })
      .from(sessionRoster)
      .where(eq(sessionRoster.sessionId, sessionId));
    const { byUser } = await this.variants.rosterVariantsOf(executor, sessionId);
    return members.map((member) => ({
      ...member,
      variantLabel: byUser.get(member.userId)?.label ?? null,
    }));
  }

  async isInRoster(sessionId: string, userId: string, executor: GradingSessionExecutor = this.db) {
    const [row] = await executor
      .select({ userId: sessionRoster.userId })
      .from(sessionRoster)
      .where(and(eq(sessionRoster.sessionId, sessionId), eq(sessionRoster.userId, userId)));
    return row !== undefined;
  }

  async search(q: string, limit: number) {
    const like = `%${escapeLike(q.trim().toLowerCase())}%`;
    const rows = await this.db
      .select()
      .from(sessions)
      .where(q.trim() ? sql`lower(${sessions.title}) LIKE ${like}` : undefined)
      .orderBy(desc(sessions.opensAt))
      .limit(limit);
    return withOverrides(this.db, rows, this.variants);
  }
}
