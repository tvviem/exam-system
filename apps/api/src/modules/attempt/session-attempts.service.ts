import {
  ATTEMPT_GRACE_SECONDS,
  extensionScopeOf,
  extensionWithinCap,
  UNDO_FORCE_SUBMIT_WINDOW_MS,
  UNDO_WATCH_MS,
  type UndoProblem,
  undoDeadlineOf,
  undoProblemOf,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ApiError } from '../../common/api-error';
import { ATTEMPT_GRADE_GUARD, type AttemptGradeGuard } from '../../common/attempt-grading';
import { CLOCK, type Clock } from '../../common/clock';
import { EXAM_CONTENT, type ExamContentProvider } from '../../common/exam-content';
import { uniqueViolationOf } from '../../common/pg-error';
import type {
  ExamDeviceSummary,
  ExtendTimeInput,
  ExtendTimeResult,
  ForceSubmitInput,
  ForceSubmitResult,
  MonitorAttempt,
  SessionAttempts,
  SubmitReason,
  UndoForceSubmitInput,
  UndoForceSubmitResult,
  ViolationInput,
} from '../../common/session-attempts';
import type { UserDeactivationHooks } from '../../common/user-deactivation';
import { type Database, DB, type Transaction } from '../../db/db.module';
import {
  attemptReopenings,
  attempts,
  attemptTimeExtensions,
  sessionDevices,
  violations,
} from './attempt.schema';
import { closeInProgress } from './attempt-close';
import { AttemptPresence } from './attempt-presence';
import { deviceProblem } from './device-problem';

/** Lý do ghi khi thiết bị đang gắn bị thu hồi để nhường chỗ cho thiết bị được Hoàn tác Thu hồi (Q234). */
const PARDON_SWAP_REASON = 'pardon_swap';

/** Cài đặt cổng `SESSION_ATTEMPTS` (Q228) cho `session`. */
@Injectable()
export class SessionAttemptsService implements SessionAttempts, UserDeactivationHooks {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EXAM_CONTENT) private readonly content: ExamContentProvider,
    private readonly presence: AttemptPresence,
    @Inject(ATTEMPT_GRADE_GUARD) private readonly gradeGuard: AttemptGradeGuard,
  ) {}

  async hasAttempts(sessionId: string, executor: Pick<Database, 'select'> = this.db) {
    const [row] = await executor
      .select({ n: count() })
      .from(attempts)
      .where(eq(attempts.sessionId, sessionId));
    return (row?.n ?? 0) > 0;
  }

  async attemptCounts(sessionId: string) {
    const rows = await this.db
      .select({ userId: attempts.userId, n: count() })
      .from(attempts)
      .where(eq(attempts.sessionId, sessionId))
      .groupBy(attempts.userId);
    return new Map(rows.map((row) => [row.userId, row.n]));
  }

  async closeAll(tx: Transaction, sessionId: string, reason: SubmitReason) {
    return closeInProgress(tx, eq(attempts.sessionId, sessionId), reason, this.clock.now());
  }

  async closeForUser(tx: Transaction, userId: string, reason: SubmitReason) {
    return (await closeInProgress(tx, eq(attempts.userId, userId), reason, this.clock.now()))
      .length;
  }

  /** Khóa đăng nhập hoặc Xóa người dùng (Q218): nộp các Lượt đang làm của người đó. */
  async onDeactivated(tx: Transaction, userId: string) {
    await this.closeForUser(tx, userId, 'account_locked');
  }

  async devicesOf(sessionId: string) {
    const rows = await this.db
      .select()
      .from(sessionDevices)
      .where(eq(sessionDevices.sessionId, sessionId));
    const map = new Map<string, ExamDeviceSummary[]>();
    for (const row of rows) {
      const list = map.get(row.userId) ?? [];
      list.push({
        userId: row.userId,
        deviceId: row.id,
        status: row.status,
        ip: row.ip,
        userAgent: row.userAgent,
        boundAt: row.boundAt,
        revokedAt: row.revokedAt,
      });
      map.set(row.userId, list);
    }
    return map;
  }

  async revokeDevice(
    tx: Transaction,
    input: { sessionId: string; userId: string; by: string; reason: string | null; now: Date },
  ) {
    const rows = await tx
      .update(sessionDevices)
      .set({
        status: 'revoked',
        revokedAt: input.now,
        revokedBy: input.by,
        revokeReason: input.reason,
      })
      .where(
        and(
          eq(sessionDevices.sessionId, input.sessionId),
          eq(sessionDevices.userId, input.userId),
          eq(sessionDevices.status, 'active'),
        ),
      )
      .returning({ id: sessionDevices.id });
    return rows.length > 0;
  }

  async pardonDevice(
    tx: Transaction,
    input: { sessionId: string; userId: string; deviceId: string; by: string; now: Date },
  ) {
    const [target] = await tx
      .select({ id: sessionDevices.id })
      .from(sessionDevices)
      .where(
        and(
          eq(sessionDevices.id, input.deviceId),
          eq(sessionDevices.sessionId, input.sessionId),
          eq(sessionDevices.userId, input.userId),
          eq(sessionDevices.status, 'revoked'),
        ),
      )
      .for('update');
    if (!target) return false;
    // Thu hồi thiết bị mới (nếu có) trước để chỉ mục "một thiết bị đang gắn" không bị vi phạm, rồi kích hoạt lại thiết bị cũ.
    await tx
      .update(sessionDevices)
      .set({
        status: 'revoked',
        revokedAt: input.now,
        revokedBy: input.by,
        revokeReason: PARDON_SWAP_REASON,
      })
      .where(
        and(
          eq(sessionDevices.sessionId, input.sessionId),
          eq(sessionDevices.userId, input.userId),
          eq(sessionDevices.status, 'active'),
          sql`${sessionDevices.id} <> ${input.deviceId}`,
        ),
      );
    try {
      // Điểm lưu: thiết bị khác vừa nhập mã và chiếm chỗ "đang gắn" thì báo lỗi rõ ràng thay vì lỗi máy chủ.
      await tx.transaction(async (inner) => {
        await inner
          .update(sessionDevices)
          .set({ status: 'active', pardonedAt: input.now })
          .where(eq(sessionDevices.id, input.deviceId));
      });
    } catch (error) {
      if (uniqueViolationOf(error)) {
        throw new ApiError('INVALID_STATE', { reason: 'DEVICE_BOUND_ELSEWHERE' });
      }
      throw error;
    }
    return true;
  }

  async extendTime(tx: Transaction, input: ExtendTimeInput): Promise<ExtendTimeResult> {
    const { sessionId, batchId, minutes } = input;
    // Thử lại cùng yêu cầu: đã có dòng nhật ký của mã lô trong Phiên thi này thì không đổi gì (Q262).
    const [done] = await tx
      .select({
        n: count(),
        minMinutes: sql<number>`min(${attemptTimeExtensions.minutes})::int`,
        maxMinutes: sql<number>`max(${attemptTimeExtensions.minutes})::int`,
        reasons: sql<number>`count(distinct ${attemptTimeExtensions.reason})::int`,
        reason: sql<string | null>`min(${attemptTimeExtensions.reason})`,
      })
      .from(attemptTimeExtensions)
      .innerJoin(attempts, eq(attempts.id, attemptTimeExtensions.attemptId))
      .where(and(eq(attempts.sessionId, sessionId), eq(attemptTimeExtensions.batchId, batchId)));
    if (done && done.n > 0) {
      // Cùng mã lô nhưng yêu cầu khác: lỗi của giao diện dùng lại mã, báo chứ không nuốt im lặng.
      if (
        done.minMinutes !== minutes ||
        done.maxMinutes !== minutes ||
        done.reasons !== 1 ||
        done.reason !== input.reason
      ) {
        throw new ApiError('INVALID_STATE', { reason: 'BATCH_REUSED' });
      }
      return { extended: done.n, skipped: 0, replayed: true, attemptIds: [] };
    }

    const chosen = uniqueIds(input.attemptIds);
    if (chosen) await this.requireInSession(tx, sessionId, chosen);
    // Khóa theo thứ tự id như `closeInProgress`; Nộp bài xen vào thì chờ rồi bị loại vì không còn đang làm.
    const targets = await tx
      .select({ id: attempts.id })
      .from(attempts)
      .where(
        and(
          eq(attempts.sessionId, sessionId),
          eq(attempts.status, 'in_progress'),
          chosen ? inArray(attempts.id, chosen) : undefined,
        ),
      )
      .orderBy(attempts.id)
      .for('update');
    const skipped = chosen ? chosen.length - targets.length : 0;
    if (targets.length === 0) return { extended: 0, skipped, replayed: false, attemptIds: [] };
    const ids = targets.map((row) => row.id);

    const sums = await tx
      .select({
        attemptId: attemptTimeExtensions.attemptId,
        total: sql<number>`sum(${attemptTimeExtensions.minutes})::int`,
      })
      .from(attemptTimeExtensions)
      .where(inArray(attemptTimeExtensions.attemptId, ids))
      .groupBy(attemptTimeExtensions.attemptId);
    const overLimit = sums
      .filter((row) => !extensionWithinCap(row.total, minutes))
      .map((row) => row.attemptId);
    if (overLimit.length > 0) {
      throw new ApiError('INVALID_STATE', { reason: 'EXTENSION_LIMIT', attemptIds: overLimit });
    }

    await tx
      .update(attempts)
      .set({ deadline: sql`${attempts.deadline} + make_interval(mins => ${minutes})` })
      .where(inArray(attempts.id, ids));
    const scope = extensionScopeOf(chosen);
    await tx.insert(attemptTimeExtensions).values(
      ids.map((attemptId) => ({
        id: uuidv7(),
        attemptId,
        minutes,
        scope,
        reason: input.reason,
        batchId,
        extendedBy: input.by,
        at: input.now,
      })),
    );
    return { extended: ids.length, skipped, replayed: false, attemptIds: ids };
  }

  /**
   * Lượt này của chính người này và `deviceKey` là thiết bị đang gắn: được nhận tin đẩy của Lượt (ADR-0007) khi đang làm bài,
   * hoặc vừa bị Buộc nộp trong `UNDO_WATCH_MS` để biết ngay khi Người ra đề Hoàn tác (Q279).
   */
  async canFollow(
    userId: string,
    attemptId: string,
    deviceKey: string | undefined,
  ): Promise<boolean> {
    const [attempt] = await this.db
      .select({
        sessionId: attempts.sessionId,
        status: attempts.status,
        submitReason: attempts.submitReason,
        submittedAt: attempts.submittedAt,
      })
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)));
    const watching =
      attempt?.status === 'submitted' &&
      attempt.submitReason === 'examiner' &&
      attempt.submittedAt !== null &&
      this.clock.now().getTime() - attempt.submittedAt.getTime() <= UNDO_WATCH_MS;
    if (!attempt || (attempt.status !== 'in_progress' && !watching)) return false;
    if (!attempt || !deviceKey) return false;
    const devices = await this.db
      .select({ status: sessionDevices.status, deviceHash: sessionDevices.deviceHash })
      .from(sessionDevices)
      .where(
        and(eq(sessionDevices.sessionId, attempt.sessionId), eq(sessionDevices.userId, userId)),
      );
    return deviceProblem(devices, deviceKey) === null;
  }

  async liveAttemptIds(sessionId: string, userIds?: string[]) {
    if (userIds?.length === 0) return [];
    const rows = await this.db
      .select({ id: attempts.id })
      .from(attempts)
      .where(
        and(
          eq(attempts.sessionId, sessionId),
          eq(attempts.status, 'in_progress'),
          userIds ? inArray(attempts.userId, userIds) : undefined,
        ),
      );
    return rows.map((row) => row.id);
  }

  /** Lượt chưa nộp và chưa quá hạn cộng ân hạn (Lượt quá hạn là việc của job quét, không còn "đang làm"). */
  private inProgressNow(now: Date) {
    return and(
      eq(attempts.status, 'in_progress'),
      sql`${attempts.deadline} + make_interval(secs => ${ATTEMPT_GRACE_SECONDS}) >= ${now}`,
    );
  }

  waitingLastSeen(sessionId: string) {
    return this.presence.waitingLastSeen(sessionId);
  }

  async inProgressCounts(sessionIds: string[], executor: Pick<Database, 'select'> = this.db) {
    const counts = new Map<string, number>();
    if (sessionIds.length === 0) return counts;
    const rows = await executor
      .select({ sessionId: attempts.sessionId, n: count() })
      .from(attempts)
      .where(and(inArray(attempts.sessionId, sessionIds), this.inProgressNow(this.clock.now())))
      .groupBy(attempts.sessionId);
    for (const row of rows) counts.set(row.sessionId, row.n);
    return counts;
  }

  async sessionIdsWithInProgressOf(userId: string, executor: Pick<Database, 'select'> = this.db) {
    const rows = await executor
      .select({ sessionId: attempts.sessionId })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), this.inProgressNow(this.clock.now())))
      .groupBy(attempts.sessionId);
    return rows.map((row) => row.sessionId);
  }

  async monitorAttempts(sessionId: string, examId: string) {
    // Mọi truy vấn độc lập nhau nên chạy song song; số liệu đếm theo cả Phiên thi rồi lấy phần của Lượt mới nhất.
    const [latest, counts, hidden, warned, lastSeen, summaries] = await Promise.all([
      this.db.execute<{
        id: string;
        user_id: string;
        attempt_no: number;
        status: 'in_progress' | 'submitted';
        submit_reason: SubmitReason | null;
        started_at: Date;
        deadline: Date;
        submitted_at: Date | null;
      }>(sql`
        select distinct on (user_id) id, user_id, attempt_no, status, submit_reason, started_at, deadline, submitted_at
        from attempts where session_id = ${sessionId} order by user_id, attempt_no desc`),
      // "Đã trả lời" = có giá trị khác rỗng. Các dạng rỗng ({optionIds:[]}, {answers:{}}, {text:""}) phải khớp
      // `responseSchemaFor` (packages/shared/src/attempt.ts): thêm Loại câu mới thì sửa cả hai nơi.
      this.db.execute<{ attempt_id: string; n: number }>(sql`
        select r.attempt_id, count(*)::int n
        from responses r join attempts a on a.id = r.attempt_id
        where a.session_id = ${sessionId}
          and r.value is not null and r.value <> 'null'::jsonb
          and r.value <> '{"optionIds":[]}'::jsonb and r.value <> '{"answers":{}}'::jsonb
          and r.value <> '{"text":""}'::jsonb
        group by r.attempt_id`),
      this.db.execute<{ attempt_id: string; n: number }>(sql`
        select attempt_id, count(*)::int n from session_events
        where session_id = ${sessionId} and type = 'tab_hidden' and attempt_id is not null group by attempt_id`),
      this.db.execute<{ attempt_id: string; n: number }>(sql`
        select attempt_id, count(*)::int n from violations
        where session_id = ${sessionId} and action = 'warning' group by attempt_id`),
      this.presence.lastSeenOf(sessionId),
      this.content.summariesOf([examId]),
    ]);
    const numbers = (rows: { attempt_id: string; n: number }[]) =>
      new Map(rows.map((row) => [row.attempt_id, row.n]));
    const answered = numbers(counts.rows);
    const hiddenBy = numbers(hidden.rows);
    const warnedBy = numbers(warned.rows);
    const byUser = new Map<string, MonitorAttempt>();
    for (const row of latest.rows) {
      byUser.set(row.user_id, {
        attemptId: row.id,
        attemptNo: row.attempt_no,
        status: row.status,
        submitReason: row.submit_reason,
        startedAt: new Date(row.started_at),
        deadline: new Date(row.deadline),
        submittedAt: row.submitted_at ? new Date(row.submitted_at) : null,
        answered: answered.get(row.id) ?? 0,
        hiddenCount: hiddenBy.get(row.id) ?? 0,
        warnings: warnedBy.get(row.id) ?? 0,
        lastSeenAt: lastSeen.get(row.id) ?? null,
      });
    }
    return { totalItems: summaries.get(examId)?.itemCount ?? 0, byUser };
  }

  async forceSubmit(tx: Transaction, input: ForceSubmitInput): Promise<ForceSubmitResult> {
    const chosen = uniqueIds(input.attemptIds);
    if (chosen) await this.requireInSession(tx, input.sessionId, chosen);
    const closed = await closeInProgress(
      tx,
      chosen
        ? (and(eq(attempts.sessionId, input.sessionId), inArray(attempts.id, chosen)) ?? sql`false`)
        : eq(attempts.sessionId, input.sessionId),
      'examiner',
      input.now,
    );
    return {
      closed: closed.length,
      skipped: chosen ? chosen.length - closed.length : 0,
      closedIds: closed,
    };
  }

  async undoForceSubmit(
    tx: Transaction,
    input: UndoForceSubmitInput,
  ): Promise<UndoForceSubmitResult> {
    const chosen = uniqueIds(input.attemptIds);
    if (chosen) await this.requireInSession(tx, input.sessionId, chosen);
    const windowStart = new Date(input.now.getTime() - UNDO_FORCE_SUBMIT_WINDOW_MS);
    // Khóa các Lượt theo `id`. Người gọi đã khóa Phiên thi `FOR UPDATE` nên Bắt đầu Lượt (giữ `FOR SHARE` trên Phiên thi) chờ.
    const rows = await tx
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.sessionId, input.sessionId),
          chosen
            ? inArray(attempts.id, chosen)
            : and(
                eq(attempts.status, 'submitted'),
                eq(attempts.submitReason, 'examiner'),
                gte(attempts.submittedAt, windowStart),
              ),
        ),
      )
      .orderBy(attempts.id)
      .for('update');
    if (rows.length === 0) return { reopened: [], skipped: [] };

    const latest = await tx
      .select({ userId: attempts.userId, latestNo: sql<number>`max(${attempts.attemptNo})::int` })
      .from(attempts)
      .where(
        and(
          eq(attempts.sessionId, input.sessionId),
          inArray(attempts.userId, [...new Set(rows.map((row) => row.userId))]),
        ),
      )
      .groupBy(attempts.userId);
    const latestNo = new Map(latest.map((row) => [row.userId, row.latestNo]));

    let reopened: UndoForceSubmitResult['reopened'] = [];
    const skipped: UndoForceSubmitResult['skipped'] = [];
    for (const row of rows) {
      const problem: UndoProblem | null =
        undoProblemOf({
          status: row.status,
          submitReason: row.submitReason,
          submittedAt: row.submittedAt,
          deadline: row.deadline,
          now: input.now,
          sessionCancelled: input.sessionCancelled,
          hasNewerAttempt: (latestNo.get(row.userId) ?? row.attemptNo) > row.attemptNo,
        }) ?? null;
      const deadline =
        problem === null && row.submittedAt
          ? undoDeadlineOf({
              submittedAt: row.submittedAt,
              deadline: row.deadline,
              now: input.now,
              hardClose: input.hardClose,
              closesAt: input.closesAt,
            })
          : null;
      if (problem) skipped.push({ attemptId: row.id, problem });
      else if (!deadline) skipped.push({ attemptId: row.id, problem: 'ATTEMPT_EXPIRED' });
      else reopened.push({ attemptId: row.id, userId: row.userId, deadline });
    }
    // Đã có điểm chấm tay thì không mở lại được (Q296); điểm tự động thì xóa để nộp lại được chấm lại.
    const graded = await this.gradeGuard.manuallyGradedIds(
      tx,
      reopened.map((item) => item.attemptId),
    );
    if (graded.size > 0) {
      for (const item of reopened) {
        if (graded.has(item.attemptId)) {
          skipped.push({ attemptId: item.attemptId, problem: 'ALREADY_GRADED' });
        }
      }
      reopened = reopened.filter((item) => !graded.has(item.attemptId));
    }
    if (reopened.length === 0) return { reopened, skipped };
    await this.gradeGuard.discard(
      tx,
      reopened.map((item) => item.attemptId),
    );

    // Nhật ký trước (trigger `attempts_guard` đòi dòng khớp lần nộp và hạn mới), rồi mở lại cả lô bằng một câu lệnh.
    const submittedAt = new Map(rows.map((row) => [row.id, row.submittedAt as Date]));
    try {
      await tx.insert(attemptReopenings).values(
        reopened.map((item) => ({
          attemptId: item.attemptId,
          reopenedBy: input.by,
          reopenedAt: input.now,
          previousSubmittedAt: submittedAt.get(item.attemptId) as Date,
          newDeadline: item.deadline,
        })),
      );
      await tx.execute(sql`
        update attempts a
        set status = 'in_progress', submitted_at = null, submit_reason = null, deadline = v.deadline
        from (values ${sql.join(
          reopened.map(
            (item) => sql`(${item.attemptId}::uuid, ${item.deadline.toISOString()}::timestamptz)`,
          ),
          sql`, `,
        )}) as v(id, deadline)
        where a.id = v.id`);
    } catch (error) {
      // Người này vừa bắt đầu Lượt mới: chỉ mục một Lượt đang làm chặn, báo như một lý do từ chối.
      const violated = uniqueViolationOf(error);
      if (violated === 'attempts_one_in_progress') {
        throw new ApiError('INVALID_STATE', { reason: 'NEW_ATTEMPT_STARTED' });
      }
      // Hai lần hoàn tác cùng một lần nộp xen nhau (Phiên thi đã khóa nên hiếm): lần sau thấy Lượt không còn bị Buộc nộp.
      if (violated === 'attempt_reopenings_once') {
        throw new ApiError('INVALID_STATE', { reason: 'NOT_FORCE_SUBMITTED' });
      }
      throw error;
    }
    return { reopened, skipped };
  }

  async recordViolation(tx: Transaction, input: ViolationInput) {
    const [attempt] = await tx
      .select({ userId: attempts.userId, status: attempts.status })
      .from(attempts)
      .where(and(eq(attempts.id, input.attemptId), eq(attempts.sessionId, input.sessionId)))
      .for('update');
    if (!attempt) throw new ApiError('NOT_FOUND');
    if (attempt.status !== 'in_progress') {
      throw new ApiError('INVALID_STATE', { reason: 'ATTEMPT_CLOSED' });
    }
    const id = uuidv7();
    await tx.insert(violations).values({
      id,
      attemptId: input.attemptId,
      sessionId: input.sessionId,
      userId: attempt.userId,
      action: input.action,
      reason: input.reason,
      recordedBy: input.by,
      recordedAt: input.now,
    });
    if (input.action === 'disqualify') {
      await closeInProgress(tx, eq(attempts.id, input.attemptId), 'disqualified', input.now);
    }
    return { id, userId: attempt.userId };
  }

  /** Mọi id phải là Lượt của Phiên thi này, nếu không coi như không tồn tại (không lộ Lượt của Phiên thi khác). */
  private async requireInSession(tx: Transaction, sessionId: string, ids: string[]) {
    const [known] = await tx
      .select({ n: count() })
      .from(attempts)
      .where(and(eq(attempts.sessionId, sessionId), inArray(attempts.id, ids)));
    if ((known?.n ?? 0) !== ids.length) throw new ApiError('NOT_FOUND');
  }
}

/** Bỏ id trùng; `null` (cả phòng) giữ nguyên. */
const uniqueIds = (ids: string[] | null): string[] | null => (ids ? [...new Set(ids)] : null);
