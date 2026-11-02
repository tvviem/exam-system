import { randomInt } from 'node:crypto';
import {
  ATTEMPT_GRACE_SECONDS,
  deadlineOf,
  HARD_CLOSE_MIN_SECONDS,
  type LayoutInput,
  layoutOf,
  normalizeAccessCode,
  phaseOf,
  responseSchemaFor,
  type SessionPhase,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { EXAM_CONTENT, type ExamContentProvider } from '../../common/exam-content';
import { uniqueViolationOf } from '../../common/pg-error';
import type { SubmitReason } from '../../common/session-attempts';
import { type EntryGate, SESSION_ENTRY, type SessionEntry } from '../../common/session-entry';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { attempts, responses, sessionDevices } from './attempt.schema';
import { buildAttemptSections, type SavedResponse } from './attempt-view';
import { generateDeviceKey, hashDeviceKey } from './device-key';
import { JoinRateLimiter } from './join-rate-limiter';

type Executor = Database | Transaction;
type AttemptRow = typeof attempts.$inferSelect;

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface SaveItemInput {
  itemId: string;
  clientSeq: number;
  value?: unknown;
  flagged?: boolean;
}

export type SaveItemResult =
  | { itemId: string; status: 'saved' | 'stale' }
  | { itemId: string; status: 'rejected'; reason: 'unknown_item' | 'invalid_value' };

const invalidState = (reason: string) => new ApiError('INVALID_STATE', { reason });

/** Lý do không cho vào hoặc bắt đầu theo trạng thái Phiên thi; `null` là được. `running`: người này đang có Lượt dở. */
function entryProblem(phase: SessionPhase, running: boolean): string | null {
  switch (phase) {
    case 'cancelled':
      return 'SESSION_CANCELLED';
    case 'upcoming':
      return 'NOT_OPEN_YET';
    case 'open':
      return null;
    case 'entry_closed':
      return running ? null : 'ENTRY_CLOSED';
    case 'closed':
      return running ? null : 'WINDOW_CLOSED';
  }
}

/** Chọn Phiên thi khi một Mã vào thi khớp nhiều Phiên thi (các Khung giờ không chồng nhau, Q222). */
function pickGate(gates: EntryGate[], now: Date): EntryGate {
  const live = gates
    .filter((gate) => phaseOf(gate, now) !== 'closed' && phaseOf(gate, now) !== 'cancelled')
    .sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime());
  return (live[0] ?? gates[0]) as EntryGate;
}

/** Vào thi, bắt đầu và làm bài của Người dự thi (Q192–Q236). Chỉ đọc bản chụp của Bộ đề (ADR-0005). */
@Injectable()
export class AttemptsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SESSION_ENTRY) private readonly entry: SessionEntry,
    @Inject(EXAM_CONTENT) private readonly content: ExamContentProvider,
    private readonly joinLimiter: JoinRateLimiter,
  ) {}

  // --- Vào thi (Q229) -----------------------------------------------------------------------------------------------

  /** Nhập Mã vào thi: gắn thiết bị ở lần đầu. Trả mã thiết bị để đặt cookie. */
  async join(userId: string, deviceKey: string | undefined, rawCode: string, meta: ClientMeta) {
    if (await this.joinLimiter.isBlocked(userId)) throw new ApiError('RATE_LIMITED');
    const code = normalizeAccessCode(rawCode);
    const gates = /^[A-Z0-9]{4,12}$/.test(code) ? await this.entry.findByCode(userId, code) : [];
    if (gates.length === 0) {
      await this.joinLimiter.recordFailure(userId);
      throw new ApiError('INVALID_ACCESS_CODE');
    }
    const now = this.clock.now();
    const gate = pickGate(gates, now);
    const running = await this.inProgressOf(this.db, gate.sessionId, userId);
    const problem = entryProblem(phaseOf(gate, now), running !== undefined);
    if (problem) throw invalidState(problem);
    await this.joinLimiter.clear(userId);

    const key = deviceKey ?? generateDeviceKey();
    await this.bindDevice(this.db, gate.sessionId, userId, hashDeviceKey(key), meta);
    return { deviceKey: key, sessionId: gate.sessionId, attemptId: running?.id ?? null };
  }

  private async bindDevice(
    db: Database,
    sessionId: string,
    userId: string,
    hash: string,
    meta: ClientMeta,
  ) {
    await db.transaction(async (tx) => {
      const mine = () =>
        tx
          .select({ status: sessionDevices.status })
          .from(sessionDevices)
          .where(
            and(
              eq(sessionDevices.sessionId, sessionId),
              eq(sessionDevices.userId, userId),
              eq(sessionDevices.deviceHash, hash),
            ),
          );
      const settle = async () => {
        const [row] = await mine();
        if (!row) return false;
        if (row.status === 'revoked') throw invalidState('DEVICE_REVOKED');
        return true;
      };
      if (await settle()) return;
      // Chỉ mục duy nhất từng phần quyết định khi hai thiết bị nhập mã cùng lúc: chỉ một dòng được chèn.
      const inserted = await tx
        .insert(sessionDevices)
        .values({
          sessionId,
          userId,
          deviceHash: hash,
          ip: meta.ip,
          userAgent: meta.userAgent,
        })
        .onConflictDoNothing()
        .returning({ id: sessionDevices.id });
      if (inserted.length === 0 && !(await settle())) throw invalidState('DEVICE_BOUND_ELSEWHERE');
    });
  }

  /** Kiểm thiết bị trong giao dịch, khóa dòng gắn `FOR SHARE` để Thu hồi xen vào thì chờ (ADR-0007). */
  private async requireDevice(tx: Transaction, sessionId: string, userId: string, key?: string) {
    const rows = await tx
      .select({ status: sessionDevices.status, deviceHash: sessionDevices.deviceHash })
      .from(sessionDevices)
      .where(and(eq(sessionDevices.sessionId, sessionId), eq(sessionDevices.userId, userId)))
      .for('share');
    const hash = key ? hashDeviceKey(key) : undefined;
    const mine = rows.find((row) => row.deviceHash === hash);
    if (mine?.status === 'active') return;
    if (mine?.status === 'revoked') throw invalidState('DEVICE_REVOKED');
    throw invalidState(
      rows.some((row) => row.status === 'active') ? 'DEVICE_BOUND_ELSEWHERE' : 'NOT_JOINED',
    );
  }

  // --- Phiên thi của tôi ---------------------------------------------------------------------------------------------

  async listFor(userId: string) {
    const now = this.clock.now();
    const gates = await this.entry.listFor(userId, new Date(now.getTime() - 30 * 24 * 3_600_000));
    if (gates.length === 0) return { items: [] };
    const mine = await this.db
      .select({
        sessionId: attempts.sessionId,
        status: attempts.status,
        id: attempts.id,
      })
      .from(attempts)
      .where(eq(attempts.userId, userId));
    const summaries = await this.content.summariesOf(gates.map((gate) => gate.examId));
    return {
      items: gates.map((gate) => {
        const own = mine.filter((attempt) => attempt.sessionId === gate.sessionId);
        const summary = summaries.get(gate.examId);
        return {
          sessionId: gate.sessionId,
          title: gate.title,
          examTitle: summary?.title ?? '',
          questionCount: summary?.itemCount ?? 0,
          opensAt: gate.opensAt,
          closesAt: gate.closesAt,
          phase: phaseOf(gate, now),
          durationMinutes: gate.durationMinutes + gate.extraMinutes,
          maxAttempts: gate.maxAttempts,
          attemptsUsed: own.length,
          inProgressAttemptId: own.find((attempt) => attempt.status === 'in_progress')?.id ?? null,
        };
      }),
    };
  }

  // --- Bắt đầu và xem (Q230, Q232) -----------------------------------------------------------------------------------

  /** Bắt đầu Lượt mới hoặc làm tiếp Lượt đang mở. */
  async start(userId: string, deviceKey: string | undefined, sessionId: string) {
    const attemptId = await this.db.transaction(async (tx) => {
      const gate = await this.entry.gateFor(sessionId, userId, tx);
      if (!gate) throw new ApiError('NOT_FOUND');
      await this.requireDevice(tx, sessionId, userId, deviceKey);
      const now = this.clock.now();

      const running = await this.inProgressOf(tx, sessionId, userId);
      if (running && now.getTime() <= running.deadline.getTime() + ATTEMPT_GRACE_SECONDS * 1000) {
        return running.id;
      }
      if (running) await this.closeOne(tx, running.id, 'timeout', now);

      const problem = entryProblem(phaseOf(gate, now), false);
      if (problem) throw invalidState(problem);
      if (
        gate.hardClose &&
        gate.closesAt.getTime() - now.getTime() < HARD_CLOSE_MIN_SECONDS * 1000
      ) {
        throw invalidState('WINDOW_CLOSED');
      }
      const [{ used } = { used: 0 }] = await tx
        .select({ used: count() })
        .from(attempts)
        .where(and(eq(attempts.sessionId, sessionId), eq(attempts.userId, userId)));
      if (used >= gate.maxAttempts) throw invalidState('ATTEMPTS_EXHAUSTED');

      const content = await this.content.contentOf(gate.examId, tx);
      if (!content) throw new ApiError('NOT_FOUND');
      const seed = randomInt(0, 2 ** 48 - 1);
      const layoutInput: LayoutInput = {
        sections: content.sections.map((section) => ({
          sectionId: section.id,
          items: section.items.map((item) => ({
            itemId: item.itemId,
            type: item.snapshot.type,
            optionIds: optionIdsOf(item.snapshot.payload),
            shuffleOptions: item.snapshot.payload.shuffleOptions === true,
          })),
        })),
      };
      try {
        // Điểm lưu (savepoint): vi phạm chỉ mục duy nhất chỉ hủy lần chèn này, không hủy cả giao dịch.
        return await tx.transaction(async (inner) => {
          const [row] = await inner
            .insert(attempts)
            .values({
              sessionId,
              userId,
              attemptNo: used + 1,
              seed,
              layout: layoutOf(seed, layoutInput, gate),
              startedAt: now,
              deadline: deadlineOf({
                startedAt: now,
                durationMinutes: gate.durationMinutes,
                extraMinutes: gate.extraMinutes,
                hardClose: gate.hardClose,
                closesAt: gate.closesAt,
              }),
            })
            .returning({ id: attempts.id });
          return (row as { id: string }).id;
        });
      } catch (error) {
        // Hai lần bấm bắt đầu cùng lúc: chỉ một Lượt được tạo, lần còn lại làm tiếp Lượt đó.
        const violated = uniqueViolationOf(error);
        if (
          violated === 'attempts_one_in_progress' ||
          violated === 'attempts_session_user_no_unique'
        ) {
          const winner = await this.inProgressOf(tx, sessionId, userId);
          if (winner) return winner.id;
        }
        throw error;
      }
    });
    return this.view(userId, deviceKey, attemptId);
  }

  /** Nội dung đề theo bố cục của Lượt, kèm Câu trả lời đã lưu. Lượt đã nộp chỉ trả trạng thái (Q206). */
  async view(userId: string, deviceKey: string | undefined, attemptId: string) {
    const attempt = await this.ownAttempt(this.db, userId, attemptId);
    const now = this.clock.now();
    if (attempt.status === 'in_progress' && this.pastGrace(attempt, now)) {
      await this.closeOne(this.db, attempt.id, 'timeout', now);
      return this.submittedState(await this.ownAttempt(this.db, userId, attemptId), now);
    }
    if (attempt.status === 'submitted') return this.submittedState(attempt, now);

    const gate = await this.entry.gateFor(attempt.sessionId, userId);
    if (!gate) throw new ApiError('NOT_FOUND');
    await this.db.transaction((tx) => this.requireDevice(tx, attempt.sessionId, userId, deviceKey));
    const [content, saved] = await Promise.all([
      this.content.contentOf(gate.examId),
      this.db.select().from(responses).where(eq(responses.attemptId, attempt.id)),
    ]);
    if (!content) throw new ApiError('NOT_FOUND');
    const answered = new Map<string, SavedResponse>(
      saved.map((row) => [row.itemId, { value: row.value, flagged: row.flagged }]),
    );
    return {
      status: 'in_progress' as const,
      attempt: {
        id: attempt.id,
        attemptNo: attempt.attemptNo,
        maxAttempts: gate.maxAttempts,
        startedAt: attempt.startedAt,
        deadline: attempt.deadline,
        serverNow: now,
      },
      session: { id: gate.sessionId, title: gate.title },
      exam: { title: content.title, instructions: content.instructions },
      mediaBase: `/api/take-media/${attempt.id}`,
      sections: buildAttemptSections({
        content,
        layout: attempt.layout,
        responses: answered,
        showScoringRules: gate.showScoringRules,
      }),
    };
  }

  // --- Lưu và nộp (Q231, Q233) -----------------------------------------------------------------------------------------

  /** Lưu lô Câu trả lời. Chỉ trả thành công sau khi đã ghi PostgreSQL (bất biến). */
  async saveResponses(
    userId: string,
    deviceKey: string | undefined,
    attemptId: string,
    input: SaveItemInput[],
  ) {
    const first = await this.ownAttempt(this.db, userId, attemptId);
    const now = this.clock.now();
    if (first.status === 'submitted') throw invalidState('ATTEMPT_CLOSED');
    if (this.pastGrace(first, now)) {
      await this.closeOne(this.db, first.id, 'timeout', now);
      throw invalidState('ATTEMPT_CLOSED');
    }

    // Mỗi câu một lần trong lô: lấy lần có `clientSeq` lớn nhất.
    const latest = new Map<string, SaveItemInput>();
    for (const item of input) {
      const seen = latest.get(item.itemId);
      if (!seen || item.clientSeq > seen.clientSeq) latest.set(item.itemId, item);
    }

    return this.db.transaction(async (tx) => {
      const gate = await this.entry.gateFor(first.sessionId, userId, tx);
      if (!gate) throw new ApiError('NOT_FOUND');
      await this.requireDevice(tx, first.sessionId, userId, deviceKey);
      const [attempt] = await tx
        .select()
        .from(attempts)
        .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
        .for('share');
      if (!attempt || attempt.status !== 'in_progress') throw invalidState('ATTEMPT_CLOSED');

      const items = await this.content.itemsOf(gate.examId, [...latest.keys()], tx);
      const results: SaveItemResult[] = [];
      for (const item of latest.values()) {
        const known = items.get(item.itemId);
        if (!known) {
          results.push({ itemId: item.itemId, status: 'rejected', reason: 'unknown_item' });
          continue;
        }
        const hasValue = item.value !== undefined;
        if (
          hasValue &&
          !responseSchemaFor(
            known.snapshot as unknown as Parameters<typeof responseSchemaFor>[0],
          ).safeParse(item.value).success
        ) {
          results.push({ itemId: item.itemId, status: 'rejected', reason: 'invalid_value' });
          continue;
        }
        const written = await tx.execute<{ item_id: string }>(sql`
          insert into responses (attempt_id, item_id, value, client_seq, saved_at, flagged)
          values (${attemptId}, ${item.itemId}, ${hasValue ? JSON.stringify(item.value ?? null) : null}::jsonb,
                  ${item.clientSeq}, ${now}, ${item.flagged ?? false})
          on conflict (attempt_id, item_id) do update set
            value = case when ${hasValue} then excluded.value else responses.value end,
            flagged = case when ${item.flagged !== undefined} then excluded.flagged else responses.flagged end,
            client_seq = excluded.client_seq,
            saved_at = excluded.saved_at
          where responses.client_seq < excluded.client_seq
          returning item_id`);
        results.push({ itemId: item.itemId, status: written.rows.length > 0 ? 'saved' : 'stale' });
      }
      return {
        status: 'in_progress' as const,
        deadline: attempt.deadline,
        serverNow: this.clock.now(),
        results,
      };
    });
  }

  /** Nộp bài; nộp lần hai trả lại trạng thái đã nộp (an toàn khi mạng chập chờn gửi lặp). */
  async submit(userId: string, deviceKey: string | undefined, attemptId: string) {
    return this.db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(attempts)
        .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
        .for('update');
      if (!attempt) throw new ApiError('NOT_FOUND');
      if (attempt.status === 'submitted') return this.submittedState(attempt, this.clock.now());
      await this.requireDevice(tx, attempt.sessionId, userId, deviceKey);
      const now = this.clock.now();
      const reason: SubmitReason = this.pastGrace(attempt, now) ? 'timeout' : 'candidate';
      await this.closeOne(tx, attemptId, reason, now);
      return this.submittedState(await this.ownAttempt(tx, userId, attemptId), now);
    });
  }

  // --- Đóng Lượt ------------------------------------------------------------------------------------------------------

  /** Nộp một Lượt đang làm; không làm gì nếu đã nộp. Trả `true` nếu vừa đóng. */
  async closeOne(executor: Executor, attemptId: string, reason: SubmitReason, now: Date) {
    const rows = await executor
      .update(attempts)
      .set({ status: 'submitted', submittedAt: now, submitReason: reason })
      .where(and(eq(attempts.id, attemptId), eq(attempts.status, 'in_progress')))
      .returning({ id: attempts.id });
    return rows.length > 0;
  }

  // --- Phụ trợ ---------------------------------------------------------------------------------------------------------

  private pastGrace(attempt: AttemptRow, now: Date) {
    return now.getTime() > attempt.deadline.getTime() + ATTEMPT_GRACE_SECONDS * 1000;
  }

  private submittedState(attempt: AttemptRow, now: Date) {
    return {
      status: 'submitted' as const,
      attempt: {
        id: attempt.id,
        attemptNo: attempt.attemptNo,
        submittedAt: attempt.submittedAt,
        serverNow: now,
      },
    };
  }

  private async inProgressOf(executor: Executor, sessionId: string, userId: string) {
    const [row] = await executor
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.sessionId, sessionId),
          eq(attempts.userId, userId),
          eq(attempts.status, 'in_progress'),
        ),
      )
      .orderBy(desc(attempts.attemptNo))
      .limit(1);
    return row;
  }

  /** Lượt của chính người này, hoặc NOT_FOUND (Lượt của người khác coi như không tồn tại). */
  private async ownAttempt(executor: Executor, userId: string, attemptId: string) {
    const [row] = await executor
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)));
    if (!row) throw new ApiError('NOT_FOUND');
    return row;
  }
}

/** Id Phương án (chọn một, chọn nhiều) hoặc Mệnh đề (chùm đúng/sai) theo thứ tự gốc của bản chụp. */
function optionIdsOf(payload: Record<string, unknown>): string[] {
  const list = (payload.options ?? payload.statements) as { id: string }[] | undefined;
  return list?.map((entry) => entry.id) ?? [];
}
