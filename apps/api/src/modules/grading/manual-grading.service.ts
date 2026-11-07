import { countableAttempts, fromCenti, stableOrder, toCenti, verdictOfScore } from '@exam/scoring';
import { blindLabelOf, type SaveGradeRequest } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import { CANDIDATE_DIRECTORY, type CandidateDirectory } from '../../common/candidate-directory';
import { CLOCK, type Clock } from '../../common/clock';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import { type Database, DB } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { AutogradeService } from './autograde.service';
import { EffectiveContentService } from './effective-content.service';
import { responseGrades, sessionGradings } from './grading.schema';
import { GradingAccessService } from './grading-access.service';
import {
  type GradeRow,
  type GradingContext,
  GradingContextService,
} from './grading-context.service';
import { type GradingItem, itemsOf } from './grading-layout';
import { GradingStatusService } from './grading-status.service';

/** Hàng đợi trả tối đa chừng này dòng (Phiên thi tối đa 500 người). */
const QUEUE_LIMIT = 500;

/** Một bài tự luận có chữ trong hàng đợi (không bao gồm bài bỏ trống tự được 0 điểm, Q288). */
interface QueueEntry {
  attemptId: string;
  row: GradeRow;
}

@Injectable()
export class ManualGradingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    @Inject(CANDIDATE_DIRECTORY) private readonly directory: CandidateDirectory,
    private readonly access: GradingAccessService,
    private readonly context: GradingContextService,
    private readonly content: EffectiveContentService,
    private readonly autograde: AutogradeService,
    private readonly audit: AuditService,
    private readonly status: GradingStatusService,
  ) {}

  /** Các bài tự luận có chữ của câu này, theo thứ tự ngẫu nhiên nhưng cố định (Q291); nhãn "Bài N" là hạng trong thứ tự đó. */
  private queueOf(ctx: GradingContext, itemId: string) {
    const entries: QueueEntry[] = [];
    for (const attempt of ctx.countable) {
      const row = (ctx.rows.get(attempt.attemptId) ?? []).find((r) => r.itemId === itemId);
      if (!row) continue;
      // Bài bỏ trống được chấm tự động 0 điểm (nguồn `auto`, kết luận `blank`) nên không vào hàng đợi.
      if (row.source === 'auto' && row.verdict === 'blank') continue;
      entries.push({ attemptId: attempt.attemptId, row });
    }
    const ordered = stableOrder(
      entries,
      (entry) => entry.attemptId,
      `${ctx.info.sessionId}:${itemId}`,
    );
    return ordered.map((entry, index) => ({ ...entry, label: blindLabelOf(index + 1) }));
  }

  private essayItem(ctx: { items: GradingItem[] }, itemId: string) {
    const item = ctx.items.find((i) => i.itemId === itemId);
    if (item?.type !== 'essay') throw new ApiError('NOT_FOUND');
    return item;
  }

  /** Các câu tự luận kèm tiến độ chấm. */
  async items(userId: string, sessionId: string) {
    const { info } = await this.access.require(userId, sessionId);
    const ctx = await this.context.load(info);
    return {
      blind: await this.access.isBlind(sessionId),
      items: ctx.items
        .filter((item) => item.type === 'essay')
        .map((item) => {
          const queue = this.queueOf(ctx, item.itemId);
          const pending = queue.filter((entry) => entry.row.verdict === 'pending').length;
          return {
            itemId: item.itemId,
            no: item.no,
            points: item.points,
            stem: item.stem,
            total: queue.length,
            graded: queue.length - pending,
            pending,
          };
        }),
    };
  }

  async queue(userId: string, sessionId: string, itemId: string, filter: 'pending' | 'all') {
    const { info } = await this.access.require(userId, sessionId);
    const ctx = await this.context.load(info);
    const item = this.essayItem(ctx, itemId);
    const queue = this.queueOf(ctx, itemId);
    const pending = queue.filter((entry) => entry.row.verdict === 'pending').length;
    return {
      item: { itemId, no: item.no, points: item.points },
      blind: await this.access.isBlind(sessionId),
      total: queue.length,
      graded: queue.length - pending,
      pending,
      entries: queue
        .filter((entry) => filter === 'all' || entry.row.verdict === 'pending')
        .slice(0, QUEUE_LIMIT)
        .map((entry) => ({
          attemptId: entry.attemptId,
          label: entry.label,
          graded: entry.row.verdict !== 'pending',
          score: entry.row.scoreCenti === null ? null : fromCenti(entry.row.scoreCenti),
        })),
    };
  }

  /** Một bài: đề, hướng dẫn chấm, bài làm, điểm hiện tại; tên người làm chỉ hiện khi Chấm ẩn tên tắt (Q291). */
  async entry(userId: string, sessionId: string, itemId: string, attemptId: string) {
    const { info } = await this.access.require(userId, sessionId);
    const ctx = await this.context.load(info);
    const item = this.essayItem(ctx, itemId);
    const entry = this.queueOf(ctx, itemId).find((e) => e.attemptId === attemptId);
    if (!entry) throw new ApiError('NOT_FOUND');
    const [attempt] = await this.source.loadSubmitted([attemptId]);
    if (!attempt) throw new ApiError('NOT_FOUND');
    const answer = attempt.responses.get(itemId) as { text?: string } | null | undefined;
    const blind = await this.access.isBlind(sessionId);
    let person: { userId: string; code: string | null; fullName: string } | undefined;
    if (!blind) {
      const [profile] = (await this.directory.page([attempt.userId], { limit: 1, offset: 0 }))
        .items;
      if (profile) person = { userId: profile.id, code: profile.code, fullName: profile.fullName };
    }
    return {
      attemptId,
      label: entry.label,
      blind,
      item: {
        itemId,
        no: item.no,
        points: item.points,
        stem: item.stem,
        rubric: (item.payload.rubric as unknown) ?? null,
        maxLength: (item.payload.maxLength as number | undefined) ?? null,
      },
      answer: typeof answer?.text === 'string' ? answer.text : '',
      score: entry.row.scoreCenti === null ? null : fromCenti(entry.row.scoreCenti),
      feedback: entry.row.feedback,
      graded: entry.row.verdict !== 'pending',
      ...(person ? { person } : {}),
    };
  }

  /** Lưu điểm tay một câu tự luận (idempotent); `score = null` đưa câu về chờ chấm. */
  async save(
    actor: Actor,
    sessionId: string,
    attemptId: string,
    itemId: string,
    request: SaveGradeRequest,
  ) {
    const { info } = await this.access.require(actor.id, sessionId);
    // Chỉ đọc nội dung Bộ đề và các Lượt của đúng người này: không nạp cả Phiên thi (điểm mọi bài), nên lưu điểm vẫn cỡ chục mili giây
    // dù lớp đông (đo tải 500 người: 85 ms khi nạp cả Phiên thi, PR 5e).
    const content = await this.content.contentOf(info.examId);
    if (!content) throw new ApiError('NOT_FOUND');
    const item = this.essayItem({ items: itemsOf(content) }, itemId);
    // Chỉ chấm Lượt có thể được tính (Q292), như hàng đợi.
    const [target] = await this.source.loadSubmitted([attemptId]);
    if (!target || target.sessionId !== sessionId) throw new ApiError('NOT_FOUND');
    const mine = await this.source.attemptsOfUser(sessionId, target.userId);
    if (!countableAttempts(mine, info.attemptScoring).some((a) => a.attemptId === attemptId)) {
      throw new ApiError('NOT_FOUND');
    }
    const points = toCenti(item.points);
    const centi = request.score === null ? null : toCenti(request.score);
    if (centi !== null && centi > points) {
      throw new ApiError('VALIDATION_FAILED', {
        issues: [{ code: 'score_above_max', path: ['score'] }],
      });
    }
    const score = centi === null ? null : fromCenti(centi);
    // Cổng ghi: khóa chia sẻ dòng thiết lập chấm (Công bố nối đuôi) và từ chối nếu đã Công bố (Q299).
    const write = () =>
      this.db.transaction(async (tx) => {
        await this.status.lockForWrite(tx, sessionId);
        const [row] = await tx
          .update(responseGrades)
          .set({
            score: score === null ? null : score.toFixed(2),
            verdict: verdictOfScore(score, item.points),
            source: 'manual',
            gradedBy: actor.id,
            gradedAt: this.clock.now(),
            feedback: request.feedback?.trim() ? request.feedback.trim() : null,
          })
          .where(and(eq(responseGrades.attemptId, attemptId), eq(responseGrades.itemId, itemId)))
          .returning();
        return row;
      });
    let saved = await write();
    if (!saved) {
      // Chưa chấm tự động xong (vừa nộp): chấm ngay rồi thử lại một lần.
      await this.autograde.gradeAttempts([attemptId]);
      saved = await write();
    }
    if (!saved) throw new ApiError('INVALID_STATE', { reason: 'NOT_GRADED_YET' });
    return {
      attemptId,
      itemId,
      score,
      verdict: saved.verdict,
      feedback: saved.feedback,
      gradedAt: saved.gradedAt,
    };
  }

  async setBlind(actor: Actor, sessionId: string, blind: boolean) {
    await this.access.require(actor.id, sessionId);
    const before = await this.access.isBlind(sessionId);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      await this.status.lockForWrite(tx, sessionId);
      await tx
        .insert(sessionGradings)
        .values({ sessionId, blind, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: sessionGradings.sessionId, set: { blind, updatedAt: now } });
      if (before !== blind) {
        await this.audit.record(
          {
            actor,
            action: 'session.blind_grading_changed',
            entityType: 'session',
            entityId: sessionId,
            before: { blind: before },
            after: { blind },
          },
          tx,
        );
      }
    });
    return { blind };
  }

  async getBlind(userId: string, sessionId: string) {
    await this.access.require(userId, sessionId);
    return { blind: await this.access.isBlind(sessionId) };
  }
}
