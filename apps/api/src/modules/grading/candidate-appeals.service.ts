import { appealLimitOf, type CreateAppealRequest } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, sql } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { EXAM_CONTENT, type ExamContentProvider } from '../../common/exam-content';
import { GRADING_SESSIONS, type GradingSessions } from '../../common/grading-sessions';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import { pgErrorOf } from '../../common/pg-error';
import { REALTIME_NOTIFIER, type RealtimeNotifier } from '../../common/realtime-notifier';
import { VIOLATION_PENALTIES, type ViolationPenalties } from '../../common/violation-penalties';
import { type Database, DB } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CandidateResultService } from './candidate-result.service';
import { appeals } from './grading.schema';
import { GradingAccessService } from './grading-access.service';
import { itemsOf } from './grading-layout';
import { GradingStatusService } from './grading-status.service';

/** Một Phúc khảo như Người dự thi thấy: không có Đáp án đúng, không lộ ai xử lý. */
export interface CandidateAppealView {
  id: string;
  target: 'response' | 'penalty';
  /** Số "Câu N" Người dự thi đã thấy (chỉ Phúc khảo về câu). */
  no: number | null;
  violationId: string | null;
  reason: string;
  status: 'open' | 'resolved';
  createdAt: Date;
  response: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  resolvedAt: Date | null;
}

/**
 * Người dự thi gửi và xem Phúc khảo của mình (docs/plan/slice-5.md, PR 5d-1; Q300, Q311, Q312). Chỉ đọc đúng Lượt được tính của
 * người đó (không nạp điểm cả Phiên thi): mỗi lần gọi là vài truy vấn theo khóa chính.
 */
@Injectable()
export class CandidateAppealsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GRADING_SESSIONS) private readonly sessions: GradingSessions,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    @Inject(EXAM_CONTENT) private readonly content: ExamContentProvider,
    @Inject(VIOLATION_PENALTIES) private readonly violations: ViolationPenalties,
    @Inject(REALTIME_NOTIFIER) private readonly realtime: RealtimeNotifier,
    private readonly status: GradingStatusService,
    private readonly access: GradingAccessService,
    private readonly results: CandidateResultService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private async requireMine(userId: string, sessionId: string) {
    const info = await this.sessions.info(sessionId);
    if (!info || !(await this.sessions.isInRoster(sessionId, userId))) {
      throw new ApiError('NOT_FOUND');
    }
    return info;
  }

  async create(actor: Actor, sessionId: string, request: CreateAppealRequest) {
    const info = await this.requireMine(actor.id, sessionId);
    const counted = await this.results.countedAttempt(info, actor.id);
    if (!counted) throw new ApiError('NOT_FOUND');
    const content = await this.content.contentOf(info.examId);
    if (!content) throw new ApiError('NOT_FOUND');
    const itemCount = itemsOf(content).length;
    const limit = appealLimitOf(itemCount);

    // Đối tượng Phúc khảo: câu theo số Người dự thi đã thấy, hoặc Mức xử lý của chính họ.
    let attemptId = counted.attemptId;
    let itemId: string | null = null;
    let violationId: string | null = null;
    if (request.target === 'response') {
      const seen = (await this.source.displayNumbers([counted.attemptId])).get(counted.attemptId);
      const found = [...(seen ?? [])].find(([, no]) => no === request.no);
      if (!found) throw new ApiError('NOT_FOUND');
      itemId = found[0];
    } else {
      const violation = (await this.violations.listForUser(sessionId, actor.id)).find(
        (v) => v.id === request.violationId,
      );
      // Chỉ Mức xử lý đã quyết và có tác dụng (khác "không xử lý") mới có gì để Phúc khảo.
      if (!violation || violation.penaltyDecidedAt === null || violation.penaltyType === 'none') {
        throw new ApiError('NOT_FOUND');
      }
      violationId = violation.id;
      attemptId = violation.attemptId;
    }

    const created = await this.db
      .transaction(async (tx) => {
        const state = await this.status.lockForAppeal(tx, sessionId);
        const now = this.clock.now();
        if (!state.appealUntil || now.getTime() > state.appealUntil.getTime()) {
          throw new ApiError('INVALID_STATE', { reason: 'APPEAL_PERIOD_ENDED' });
        }
        // Hai lần gửi cùng lúc của một người nối đuôi nhau, không vượt hạn mức.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`appeal:${sessionId}:${actor.id}`}, 0))`,
        );
        const [used] = await tx
          .select({ total: count() })
          .from(appeals)
          .where(and(eq(appeals.sessionId, sessionId), eq(appeals.userId, actor.id)));
        if ((used?.total ?? 0) >= limit) {
          throw new ApiError('INVALID_STATE', { reason: 'APPEAL_LIMIT_REACHED', limit });
        }
        const [row] = await tx
          .insert(appeals)
          .values({
            sessionId,
            attemptId,
            userId: actor.id,
            target: request.target,
            itemId,
            violationId,
            reason: request.reason,
            createdAt: now,
          })
          .returning();
        if (!row) throw new ApiError('NOT_FOUND');
        const [open] = await tx
          .select({ total: count() })
          .from(appeals)
          .where(and(eq(appeals.sessionId, sessionId), eq(appeals.status, 'open')));
        await this.notifications.upsertUnread(
          {
            userIds: await this.access.staffIds(info),
            type: 'appeal.new',
            sessionId,
            data: { title: info.title, count: open?.total ?? 1 },
          },
          tx,
        );
        await this.audit.record(
          {
            actor,
            action: 'appeal.created',
            entityType: 'session',
            entityId: sessionId,
            after: { appealId: row.id, target: request.target },
          },
          tx,
        );
        return { row, used: (used?.total ?? 0) + 1 };
      })
      .catch((error: unknown) => {
        if (pgErrorOf(error)?.code === '23505') {
          throw new ApiError('INVALID_STATE', { reason: 'ALREADY_APPEALED' });
        }
        throw error;
      });
    this.realtime.sessionChanged(sessionId);
    const no = request.target === 'response' ? request.no : null;
    return { appeal: toView(created.row, no), limit, used: created.used };
  }

  /** Phúc khảo của tôi: danh sách, hạn mức còn lại và hạn gửi. */
  async mine(userId: string, sessionId: string) {
    const info = await this.requireMine(userId, sessionId);
    const state = (await this.status.releaseStates([sessionId])).get(sessionId);
    if (!state) throw new ApiError('INVALID_STATE', { reason: 'NOT_RELEASED' });
    const [rows, content] = await Promise.all([
      this.db
        .select()
        .from(appeals)
        .where(and(eq(appeals.sessionId, sessionId), eq(appeals.userId, userId)))
        .orderBy(appeals.createdAt, appeals.id),
      this.content.contentOf(info.examId),
    ]);
    const limit = appealLimitOf(content ? itemsOf(content).length : 0);
    const numbers = await this.source.displayNumbers([
      ...new Set(rows.map((row) => row.attemptId)),
    ]);
    return {
      limit,
      used: rows.length,
      appealUntil: state.appealUntil,
      finalizedAt: state.finalizedAt,
      appeals: rows.map((row) =>
        toView(row, row.itemId ? (numbers.get(row.attemptId)?.get(row.itemId) ?? null) : null),
      ),
    };
  }
}

function toView(row: typeof appeals.$inferSelect, no: number | null): CandidateAppealView {
  return {
    id: row.id,
    target: row.target,
    no,
    violationId: row.violationId,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt,
    response: row.response,
    previousValue: row.previousValue,
    newValue: row.newValue,
    resolvedAt: row.resolvedAt,
  };
}
