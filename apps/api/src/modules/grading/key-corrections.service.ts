import { type KeyCorrectionPreviewRequest, type KeyCorrectionRequest, sameKey } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { ApiError, validationFailed } from '../../common/api-error';
import { EXAM_CONTENT, type ExamContentProvider } from '../../common/exam-content';
import { type Database, DB } from '../../db/db.module';
import { JOB_QUEUE, type JobQueue } from '../../queue/job-queue';
import { AuditService } from '../audit/audit.service';
import { EffectiveContentService } from './effective-content.service';
import { type Key, keyOf, keyProblem } from './effective-key';
import { keyCorrectionEffects, keyCorrections } from './grading.schema';
import { KeyRecorrectService } from './key-recorrect.service';

/**
 * Đính chính đáp án (docs/plan/slice-5.md, PR 5d-3a; Q302, Q316, Q317, Q319–Q321): chủ Bộ đề đổi Đáp án đúng của một câu. Đáp án
 * mới có hiệu lực ngay; chấm lại các Lượt đã nộp của Phiên thi chưa Chốt chạy ở nền (job `grading.recorrect`).
 */
@Injectable()
export class KeyCorrectionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(EXAM_CONTENT) private readonly exams: ExamContentProvider,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly content: EffectiveContentService,
    private readonly recorrect: KeyRecorrectService,
    private readonly audit: AuditService,
  ) {}

  /** Chỉ chủ Bộ đề (Q302); người khác, kể cả người được Ủy quyền chấm, nhận 404. */
  private async requireOwner(userId: string, examId: string) {
    if ((await this.exams.ownerOf(examId)) !== userId) throw new ApiError('NOT_FOUND');
  }

  /** Câu và đáp án hiệu lực hiện tại; từ chối đáp án mới sai dạng hay trùng đáp án hiện tại. */
  private async check(examId: string, itemId: string, newKey: Key, executor: Database) {
    const content = await this.content.contentOf(examId, executor);
    const item = content?.sections.flatMap((s) => s.items).find((i) => i.itemId === itemId);
    if (!item) throw new ApiError('NOT_FOUND');
    const problem = keyProblem(item.snapshot, newKey);
    if (problem) throw validationFailed('newKey', problem);
    const current = keyOf(item.snapshot);
    if (!current) throw validationFailed('newKey', 'essay_has_no_key');
    if (sameKey(current, newKey)) throw new ApiError('INVALID_STATE', { reason: 'KEY_UNCHANGED' });
    return { item, current };
  }

  /** Xem trước: số người tăng, giảm điểm, số Phiên thi đã Chốt giữ nguyên, số Phúc khảo đang chờ; không ghi gì. */
  async preview(
    userId: string,
    examId: string,
    itemId: string,
    request: KeyCorrectionPreviewRequest,
  ) {
    await this.requireOwner(userId, examId);
    await this.check(examId, itemId, request.newKey, this.db);
    return this.recorrect.preview(examId, itemId, request.newKey);
  }

  async create(actor: Actor, examId: string, itemId: string, request: KeyCorrectionRequest) {
    await this.requireOwner(actor.id, examId);
    const created = await this.db.transaction(async (tx) => {
      // Hai Đính chính của cùng một câu nối đuôi nhau; đang chấm lại dở thì từ chối.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`key-correction:${itemId}`}, 0))`,
      );
      const [running] = await tx
        .select({ id: keyCorrections.id })
        .from(keyCorrections)
        .where(and(eq(keyCorrections.itemId, itemId), eq(keyCorrections.status, 'running')));
      if (running) throw new ApiError('INVALID_STATE', { reason: 'CORRECTION_RUNNING' });
      const { current } = await this.check(
        examId,
        itemId,
        request.newKey,
        tx as unknown as Database,
      );
      const [row] = await tx
        .insert(keyCorrections)
        .values({
          examId,
          itemId,
          oldKey: current,
          newKey: request.newKey,
          reason: request.reason,
          correctedBy: actor.id,
        })
        .returning();
      if (!row) throw new ApiError('NOT_FOUND');
      await this.audit.record(
        {
          actor,
          action: 'exam.key_corrected',
          entityType: 'exam',
          entityId: examId,
          before: { itemId, key: current },
          after: { itemId, key: request.newKey, correctionId: row.id },
        },
        tx,
      );
      return row;
    });
    await this.queue.enqueue('grading.recorrect', { correctionId: created.id });
    return { id: created.id, status: created.status };
  }

  /** Tiến độ và tác động của một Đính chính. */
  async progress(userId: string, examId: string, correctionId: string) {
    await this.requireOwner(userId, examId);
    const [row] = await this.db
      .select()
      .from(keyCorrections)
      .where(and(eq(keyCorrections.id, correctionId), eq(keyCorrections.examId, examId)));
    if (!row) throw new ApiError('NOT_FOUND');
    const [effects] = await this.db
      .select({
        increase: sql<number>`count(*) filter (where ${keyCorrectionEffects.newScore} > coalesce(${keyCorrectionEffects.oldScore}, 0))::int`,
        decrease: sql<number>`count(*) filter (where ${keyCorrectionEffects.newScore} < coalesce(${keyCorrectionEffects.oldScore}, 0))::int`,
      })
      .from(keyCorrectionEffects)
      .where(eq(keyCorrectionEffects.correctionId, correctionId));
    return {
      id: row.id,
      itemId: row.itemId,
      status: row.status,
      total: row.totalAttempts,
      processed: row.processedAttempts,
      reason: row.reason,
      correctedAt: row.correctedAt,
      finishedAt: row.finishedAt,
      increase: effects?.increase ?? 0,
      decrease: effects?.decrease ?? 0,
    };
  }

  /** Lịch sử Đính chính của một câu, mới nhất trước. */
  async history(userId: string, examId: string, itemId: string) {
    await this.requireOwner(userId, examId);
    const rows = await this.db
      .select()
      .from(keyCorrections)
      .where(and(eq(keyCorrections.examId, examId), eq(keyCorrections.itemId, itemId)))
      .orderBy(desc(keyCorrections.correctedAt), desc(keyCorrections.id));
    return {
      items: rows.map((row) => ({
        id: row.id,
        oldKey: row.oldKey,
        newKey: row.newKey,
        reason: row.reason,
        correctedAt: row.correctedAt,
        correctedByMe: row.correctedBy === userId,
        status: row.status,
      })),
    };
  }

  /** Chấm lại lỗi (`failed`) thì chạy lại; job idempotent nên chỉ chấm nốt phần chưa đổi. */
  async retry(userId: string, examId: string, correctionId: string) {
    await this.requireOwner(userId, examId);
    const [row] = await this.db
      .update(keyCorrections)
      .set({ status: 'running', finishedAt: null })
      .where(
        and(
          eq(keyCorrections.id, correctionId),
          eq(keyCorrections.examId, examId),
          eq(keyCorrections.status, 'failed'),
        ),
      )
      .returning({ id: keyCorrections.id });
    if (!row) throw new ApiError('INVALID_STATE', { reason: 'NOT_FAILED' });
    await this.queue.enqueue('grading.recorrect', { correctionId });
    return { id: row.id, status: 'running' as const };
  }

  /** Bộ đề này đang chấm lại sau Đính chính? (Công bố và Chốt chờ, Q319.) */
  async hasRunning(examId: string, executor: Database = this.db): Promise<boolean> {
    const [row] = await executor
      .select({ total: count() })
      .from(keyCorrections)
      .where(and(eq(keyCorrections.examId, examId), eq(keyCorrections.status, 'running')));
    return (row?.total ?? 0) > 0;
  }
}
