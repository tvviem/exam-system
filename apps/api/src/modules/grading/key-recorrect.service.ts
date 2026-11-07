import { type KeyOverride, scoreResponse, toCenti } from '@exam/scoring';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import { GRADING_SESSIONS, type GradingSessions } from '../../common/grading-sessions';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import { REALTIME_NOTIFIER, type RealtimeNotifier } from '../../common/realtime-notifier';
import { type Database, DB } from '../../db/db.module';
import { NotificationsService } from '../notifications/notifications.service';
import { EffectiveContentService } from './effective-content.service';
import { appeals, keyCorrections, responseGrades } from './grading.schema';
import { GradingStatusService } from './grading-status.service';

/** Số Lượt chấm lại trong một giao dịch (Q319): lô nhỏ để không giữ khóa lâu và không chặn Chấm tay của Phiên thi khác. */
const CHUNK = 100;

/** Một dòng điểm của câu đang đính chính sẽ đổi thế nào. */
interface Change {
  attemptId: string;
  userId: string;
  sessionId: string;
  oldScore: number | null;
  newScore: number | null;
  verdict: 'correct' | 'partial' | 'wrong' | 'blank' | 'pending';
}

export interface Impact {
  /** Lượt có điểm tự động của câu này sẽ được xét chấm lại. */
  attempts: number;
  increase: number;
  decrease: number;
  unchanged: number;
  /** Phiên thi chưa Chốt (được chấm lại) và đã Chốt (giữ nguyên, Q302). */
  openSessions: number;
  finalizedSessions: number;
  /** Phúc khảo đang chờ về chính câu này. */
  openAppeals: number;
}

/**
 * Chấm lại sau Đính chính đáp án (docs/plan/slice-5.md, PR 5d-3a; Q302, Q319, Q320). Dùng chung cho xem trước (không ghi) và job
 * `grading.recorrect` (ghi theo lô). Chỉ chấm lại dòng nguồn `auto` hoặc `correction` của Lượt đã nộp thuộc Phiên thi **chưa
 * Chốt**; điểm chấm tay và Phúc khảo giữ nguyên.
 */
@Injectable()
export class KeyRecorrectService {
  private readonly logger = new Logger(KeyRecorrectService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GRADING_SESSIONS) private readonly sessions: GradingSessions,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    @Inject(REALTIME_NOTIFIER) private readonly realtime: RealtimeNotifier,
    private readonly content: EffectiveContentService,
    private readonly status: GradingStatusService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Các Lượt đã nộp của Phiên thi chưa Chốt (và chưa Hủy) dùng Bộ đề này. */
  private async plan(examId: string) {
    const all = await this.sessions.byExam(examId);
    const states = await this.status.releaseStates(all.map((s) => s.sessionId));
    const open = all.filter(
      (s) => s.cancelledAt === null && states.get(s.sessionId)?.finalizedAt == null,
    );
    const attemptIds: string[] = [];
    for (const session of open) {
      const attempts = await this.source.attemptsOfSession(session.sessionId);
      attemptIds.push(...attempts.map((a) => a.attemptId));
    }
    return {
      attemptIds,
      openSessions: open.length,
      finalizedSessions: all.filter((s) => states.get(s.sessionId)?.finalizedAt != null).length,
      sessionTitles: new Map(all.map((s) => [s.sessionId, s.title])),
      released: new Set(
        open.filter((s) => states.get(s.sessionId)?.releasedAt != null).map((s) => s.sessionId),
      ),
    };
  }

  /** Điểm mới của từng dòng thuộc `chunk` theo đáp án `newKey` (đọc, có thể khóa Lượt khi `lock`). */
  private async evaluate(
    examId: string,
    itemId: string,
    newKey: KeyOverride,
    chunk: string[],
    tx: Database,
    lock: boolean,
  ): Promise<Change[]> {
    const content = await this.content.contentOf(examId, tx);
    const item = content?.sections.flatMap((s) => s.items).find((i) => i.itemId === itemId);
    if (!item) return [];
    const attempts = await this.source.loadSubmitted(chunk, tx, { lock });
    if (attempts.length === 0) return [];
    const rows = await tx
      .select()
      .from(responseGrades)
      .where(
        and(
          eq(responseGrades.itemId, itemId),
          inArray(
            responseGrades.attemptId,
            attempts.map((a) => a.attemptId),
          ),
          inArray(responseGrades.source, ['auto', 'correction']),
        ),
      );
    const byAttempt = new Map(attempts.map((a) => [a.attemptId, a]));
    const changes: Change[] = [];
    for (const row of rows) {
      const attempt = byAttempt.get(row.attemptId);
      if (!attempt) continue;
      const scored = scoreResponse(
        { type: item.snapshot.type, points: item.points, payload: item.snapshot.payload },
        attempt.responses.get(itemId),
        newKey,
      );
      const oldScore = row.score === null ? null : Number(row.score);
      changes.push({
        attemptId: row.attemptId,
        userId: attempt.userId,
        sessionId: attempt.sessionId,
        oldScore,
        newScore: scored.score,
        verdict: scored.verdict,
      });
    }
    return changes;
  }

  /** Xem trước tác động (không ghi gì): bao nhiêu người tăng, giảm điểm. */
  async preview(examId: string, itemId: string, newKey: KeyOverride): Promise<Impact> {
    const plan = await this.plan(examId);
    let increase = 0;
    let decrease = 0;
    let unchanged = 0;
    for (let i = 0; i < plan.attemptIds.length; i += CHUNK) {
      const changes = await this.evaluate(
        examId,
        itemId,
        newKey,
        plan.attemptIds.slice(i, i + CHUNK),
        this.db,
        false,
      );
      for (const change of changes) {
        const before = toCenti(change.oldScore ?? 0);
        const after = toCenti(change.newScore ?? 0);
        if (after > before) increase++;
        else if (after < before) decrease++;
        else unchanged++;
      }
    }
    const [open] = await this.db
      .select({ total: count() })
      .from(appeals)
      .where(and(eq(appeals.itemId, itemId), eq(appeals.status, 'open')));
    return {
      attempts: increase + decrease + unchanged,
      increase,
      decrease,
      unchanged,
      openSessions: plan.openSessions,
      finalizedSessions: plan.finalizedSessions,
      openAppeals: open?.total ?? 0,
    };
  }

  /** Job `grading.recorrect`: chấm lại theo lô rồi báo Người dự thi đã Công bố mà điểm đổi. Idempotent, chạy lại được. */
  async run(correctionId: string): Promise<void> {
    const [correction] = await this.db
      .select()
      .from(keyCorrections)
      .where(eq(keyCorrections.id, correctionId));
    if (correction?.status !== 'running') return;
    try {
      const plan = await this.plan(correction.examId);
      await this.db
        .update(keyCorrections)
        .set({ totalAttempts: plan.attemptIds.length, processedAttempts: 0 })
        .where(eq(keyCorrections.id, correctionId));
      const notify = new Map<string, { userId: string; sessionId: string; attemptId: string }>();
      for (let i = 0; i < plan.attemptIds.length; i += CHUNK) {
        const chunk = plan.attemptIds.slice(i, i + CHUNK);
        const changed = await this.db.transaction(async (tx) => {
          const db = tx as unknown as Database;
          const changes = await this.evaluate(
            correction.examId,
            correction.itemId,
            correction.newKey,
            chunk,
            db,
            true,
          );
          // Phiên thi vừa được Chốt giữa chừng thì bỏ qua (điểm đã chốt không đổi, Q302).
          const sessionIds = [...new Set(changes.map((c) => c.sessionId))];
          const states = await this.status.releaseStates(sessionIds, tx);
          const now = this.clock.now();
          const done = changes.filter(
            (change) =>
              states.get(change.sessionId)?.finalizedAt == null &&
              toCenti(change.oldScore ?? 0) !== toCenti(change.newScore ?? 0),
          );
          if (done.length > 0) {
            // Ghi cả lô bằng một câu lệnh (nhanh hơn ghi từng dòng nhiều lần); trigger vẫn kiểm từng dòng.
            const ids = done.map((c) => c.attemptId);
            const fixed = (n: number | null) => (n === null ? null : n.toFixed(2));
            await tx.execute(sql`
              update response_grades as rg
              set score = v.score, verdict = v.verdict::response_verdict, source = 'correction',
                  graded_by = ${correction.correctedBy}, graded_at = ${now}
              from unnest(${sql.param(ids)}::uuid[], ${sql.param(done.map((c) => fixed(c.newScore)))}::numeric[],
                          ${sql.param(done.map((c) => c.verdict))}::text[]) as v(attempt_id, score, verdict)
              where rg.attempt_id = v.attempt_id and rg.item_id = ${correction.itemId}`);
            await tx.execute(sql`
              insert into key_correction_effects (correction_id, attempt_id, old_score, new_score)
              select ${correctionId}, v.attempt_id, v.old_score, v.new_score
              from unnest(${sql.param(ids)}::uuid[], ${sql.param(done.map((c) => fixed(c.oldScore)))}::numeric[],
                          ${sql.param(done.map((c) => fixed(c.newScore)))}::numeric[]) as v(attempt_id, old_score, new_score)
              on conflict do nothing`);
          }
          return done;
        });
        for (const change of changed) {
          if (plan.released.has(change.sessionId)) {
            notify.set(change.attemptId, {
              userId: change.userId,
              sessionId: change.sessionId,
              attemptId: change.attemptId,
            });
          }
        }
        await this.db
          .update(keyCorrections)
          .set({ processedAttempts: Math.min(plan.attemptIds.length, i + chunk.length) })
          .where(eq(keyCorrections.id, correctionId));
      }

      // Báo Người dự thi ở Phiên thi đã Công bố mà điểm câu này đổi (Q303); gộp theo (Phiên thi, số câu) để gửi hàng loạt một lần.
      const numbers = await this.source.displayNumbers([...notify.keys()]);
      const groups = new Map<string, { sessionId: string; no: number | null; userIds: string[] }>();
      for (const entry of notify.values()) {
        const no = numbers.get(entry.attemptId)?.get(correction.itemId) ?? null;
        const key = `${entry.sessionId}:${no}`;
        const group = groups.get(key) ?? { sessionId: entry.sessionId, no, userIds: [] };
        group.userIds.push(entry.userId);
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        await this.notifications.notify({
          userIds: group.userIds,
          type: 'result.corrected',
          data: {
            sessionId: group.sessionId,
            title: plan.sessionTitles.get(group.sessionId) ?? '',
            no: group.no,
          },
        });
      }
      await this.db
        .update(keyCorrections)
        .set({ status: 'done', finishedAt: this.clock.now() })
        .where(eq(keyCorrections.id, correctionId));
      for (const sessionId of plan.sessionTitles.keys()) this.realtime.sessionChanged(sessionId);
    } catch (error) {
      this.logger.error(`Chấm lại sau Đính chính ${correctionId} lỗi`, error as Error);
      await this.db
        .update(keyCorrections)
        .set({ status: 'failed', finishedAt: this.clock.now() })
        .where(eq(keyCorrections.id, correctionId));
    }
  }
}
