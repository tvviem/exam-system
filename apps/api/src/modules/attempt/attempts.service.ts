import { randomInt } from 'node:crypto';
import {
  canEnterWaitingRoom,
  deadlineOf,
  HARD_CLOSE_MIN_SECONDS,
  type HeartbeatRequest,
  isDisconnected,
  isPastGrace,
  layoutOf,
  normalizeAccessCode,
  phaseOf,
  responseSchemaFor,
  type SessionPhase,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { CANDIDATE_DIRECTORY, type CandidateDirectory } from '../../common/candidate-directory';
import { CLOCK, type Clock } from '../../common/clock';
import { EXAM_CONTENT, type ExamContentProvider } from '../../common/exam-content';
import { uniqueViolationOf } from '../../common/pg-error';
import { REALTIME_NOTIFIER, type RealtimeNotifier } from '../../common/realtime-notifier';
import type { SubmitReason } from '../../common/session-attempts';
import { type EntryGate, SESSION_ENTRY, type SessionEntry } from '../../common/session-entry';
import { type Database, DB, type Transaction } from '../../db/db.module';
import {
  attemptReopenings,
  attempts,
  attemptTimeExtensions,
  responses,
  sessionDevices,
  sessionEvents,
  violations,
} from './attempt.schema';
import { closeInProgress } from './attempt-close';
import { AttemptPresence } from './attempt-presence';
import { buildAttemptSections, layoutInputOf, type SavedResponse } from './attempt-view';
import { generateDeviceKey, hashDeviceKey } from './device-key';
import { deviceProblem } from './device-problem';
import { JoinRateLimiter } from './join-rate-limiter';
import {
  HEARTBEAT_LIMIT,
  RequestRateLimiter,
  SAVE_LIMIT,
  WAITING_LIMIT,
} from './request-rate-limiter';

type Executor = Database | Transaction;

/** Hai nhịp liền nhau chồng lên nhau chừng này để không lỡ thông báo của giao dịch xác nhận chậm. */
const HEARTBEAT_CURSOR_OVERLAP_MS = 5000;

export type Notice =
  | { id: string; kind: 'time_extended'; minutes: number; reason: string; at: string }
  | { id: string; kind: 'warning'; reason: string; at: string }
  /** Người ra đề vừa Hoàn tác Buộc nộp: Lượt được mở lại (Q279). */
  | { id: string; kind: 'reopened'; at: string };
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
    private readonly requestLimiter: RequestRateLimiter,
    private readonly presence: AttemptPresence,
    @Inject(REALTIME_NOTIFIER) private readonly realtime: RealtimeNotifier,
    @Inject(CANDIDATE_DIRECTORY) private readonly directory: CandidateDirectory,
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
    const phase = phaseOf(gate, now);
    // Trước giờ mở: trong 30 phút cuối thì vào Phòng chờ (Q284), sớm hơn thì báo giờ mở để quay lại sau.
    const waiting = canEnterWaitingRoom(phase, gate.opensAt, now);
    if (phase === 'upcoming' && !waiting) {
      throw new ApiError('INVALID_STATE', {
        reason: 'NOT_OPEN_YET',
        opensAt: gate.opensAt.toISOString(),
      });
    }
    const problem = waiting ? null : entryProblem(phase, running !== undefined);
    if (problem) throw invalidState(problem);
    await this.joinLimiter.clear(userId);

    const key = deviceKey ?? generateDeviceKey();
    await this.bindDevice(this.db, gate.sessionId, userId, hashDeviceKey(key), meta);
    this.realtime.sessionChanged(gate.sessionId);
    return {
      deviceKey: key,
      sessionId: gate.sessionId,
      attemptId: running?.id ?? null,
      waiting,
    };
  }

  /**
   * Nhịp của Phòng chờ (Q284): báo còn trực tuyến, trả giờ server và giờ mở để màn chờ đếm ngược chính xác, và `canStart`
   * khi Phiên thi đã mở. Chỉ cho người trong Danh sách, trên thiết bị đang gắn.
   */
  async waiting(userId: string, deviceKey: string | undefined, sessionId: string) {
    await this.requestLimiter.hit('waiting', userId, WAITING_LIMIT);
    const gate = await this.entry.gateFor(sessionId, userId);
    if (!gate) throw new ApiError('NOT_FOUND');
    const now = this.clock.now();
    const rows = await this.db
      .select({ status: sessionDevices.status, deviceHash: sessionDevices.deviceHash })
      .from(sessionDevices)
      .where(and(eq(sessionDevices.sessionId, sessionId), eq(sessionDevices.userId, userId)));
    if (deviceProblem(rows, deviceKey) !== null) throw invalidState('NOT_JOINED');
    const phase = phaseOf(gate, now);
    if (phase === 'cancelled') throw invalidState('SESSION_CANCELLED');
    const first = (await this.presence.waitingLastSeen(sessionId)).get(userId) === undefined;
    await this.presence.touchWaiting(sessionId, userId, now);
    if (first) this.realtime.sessionChanged(sessionId);
    return {
      serverNow: now.toISOString(),
      opensAt: gate.opensAt.toISOString(),
      phase,
      canStart: phase === 'open',
    };
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
          boundAt: this.clock.now(),
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
    const problem = deviceProblem(rows, key);
    if (problem) throw invalidState(problem);
  }

  // --- Heartbeat (Q213) -------------------------------------------------------------------------------------------------

  /**
   * Nhịp báo còn làm bài mỗi 15 giây: ghi presence và các sự kiện rời màn hình, mất mạng, rồi trả hạn hiện tại, trạng
   * thái, thiết bị còn hợp lệ không và thông báo mới (Cộng giờ, Cảnh cáo) từ mốc `since` (Q257). Thiết bị bị Thu hồi
   * không phải lỗi ở đây: trả `deviceOk: false` để màn hình báo ngay trong tối đa một nhịp.
   */
  async heartbeat(
    userId: string,
    deviceKey: string | undefined,
    attemptId: string,
    request: HeartbeatRequest,
  ) {
    await this.requestLimiter.hit('heartbeat', userId, HEARTBEAT_LIMIT);
    let attempt = await this.ownAttempt(this.db, userId, attemptId);
    const now = this.clock.now();
    // Mốc cho nhịp sau lùi 5 giây: giao dịch Cộng giờ chưa kịp xác nhận lúc này vẫn được thấy ở nhịp sau (trình duyệt bỏ trùng theo id).
    const cursor = new Date(now.getTime() - HEARTBEAT_CURSOR_OVERLAP_MS).toISOString();
    if (attempt.status === 'in_progress' && this.pastGrace(attempt, now)) {
      await this.closeOne(this.db, attempt.id, 'timeout', now);
      attempt = await this.ownAttempt(this.db, userId, attemptId);
    }
    const base = { serverNow: now.toISOString(), cursor, notices: [] as Notice[] };
    if (attempt.status === 'submitted') {
      return {
        ...base,
        status: 'submitted' as const,
        submitReason: attempt.submitReason,
        deviceOk: true,
      };
    }
    const deviceOk = await this.deviceOk(attempt.sessionId, userId, deviceKey);
    const inProgress = {
      ...base,
      status: 'in_progress' as const,
      deadline: attempt.deadline,
      deviceOk,
    };
    if (!deviceOk) return inProgress;
    const [notices, previous] = await Promise.all([
      request.since ? this.noticesSince(attempt.id, new Date(request.since)) : [],
      this.presence.touch(attempt.sessionId, attempt.id, now),
      this.recordEvents(attempt, request.events, now),
    ]);
    // Báo màn Theo dõi khi nhịp mang tin (rời màn hình, mất mạng) hoặc người này mới báo lần đầu hay vừa nối lại sau khi mất kết nối; nhịp thường
    // không đổi gì nhìn thấy được thì không báo, để 500 nhịp mỗi 15 giây không thành hỏi lại liên tục.
    if (
      previous === null ||
      request.events.length > 0 ||
      isDisconnected(previous, attempt.startedAt, now)
    ) {
      this.realtime.sessionChanged(attempt.sessionId);
    }
    return { ...inProgress, notices };
  }

  private async deviceOk(sessionId: string, userId: string, key?: string) {
    const rows = await this.db
      .select({ status: sessionDevices.status, deviceHash: sessionDevices.deviceHash })
      .from(sessionDevices)
      .where(and(eq(sessionDevices.sessionId, sessionId), eq(sessionDevices.userId, userId)));
    return deviceProblem(rows, key) === null;
  }

  private async recordEvents(attempt: AttemptRow, events: HeartbeatRequest['events'], now: Date) {
    if (events.length === 0) return;
    await this.db
      .insert(sessionEvents)
      .values(
        events.map((event) => ({
          sessionId: attempt.sessionId,
          userId: attempt.userId,
          attemptId: attempt.id,
          type: event.type,
          clientEventId: event.id,
          at: now,
        })),
      )
      .onConflictDoNothing();
  }

  private async noticesSince(attemptId: string, since: Date): Promise<Notice[]> {
    const [extensions, warnings, reopenings] = await Promise.all([
      this.db
        .select({
          id: attemptTimeExtensions.id,
          minutes: attemptTimeExtensions.minutes,
          reason: attemptTimeExtensions.reason,
          at: attemptTimeExtensions.at,
        })
        .from(attemptTimeExtensions)
        .where(
          and(eq(attemptTimeExtensions.attemptId, attemptId), gt(attemptTimeExtensions.at, since)),
        ),
      this.db
        .select({ id: violations.id, reason: violations.reason, at: violations.recordedAt })
        .from(violations)
        .where(
          and(
            eq(violations.attemptId, attemptId),
            eq(violations.action, 'warning'),
            gt(violations.recordedAt, since),
          ),
        ),
      this.db
        .select({ id: attemptReopenings.id, at: attemptReopenings.reopenedAt })
        .from(attemptReopenings)
        .where(
          and(eq(attemptReopenings.attemptId, attemptId), gt(attemptReopenings.reopenedAt, since)),
        ),
    ]);
    const notices: (Notice & { time: number })[] = [
      ...extensions.map((row) => ({
        id: row.id,
        kind: 'time_extended' as const,
        minutes: row.minutes,
        reason: row.reason,
        at: row.at.toISOString(),
        time: row.at.getTime(),
      })),
      ...reopenings.map((row) => ({
        id: row.id,
        kind: 'reopened' as const,
        at: row.at.toISOString(),
        time: row.at.getTime(),
      })),
      ...warnings.map((row) => ({
        id: row.id,
        kind: 'warning' as const,
        reason: row.reason,
        at: row.at.toISOString(),
        time: row.at.getTime(),
      })),
    ];
    return notices.sort((a, b) => a.time - b.time).map(({ time: _time, ...notice }) => notice);
  }

  // --- Phiên thi của tôi ---------------------------------------------------------------------------------------------

  async listFor(userId: string, deviceKey: string | undefined) {
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
    const devices = await this.db
      .select({
        sessionId: sessionDevices.sessionId,
        status: sessionDevices.status,
        deviceHash: sessionDevices.deviceHash,
      })
      .from(sessionDevices)
      .where(eq(sessionDevices.userId, userId));
    const hash = deviceKey ? hashDeviceKey(deviceKey) : undefined;
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
          deviceStatus: deviceStatusOf(
            devices.filter((device) => device.sessionId === gate.sessionId),
            hash,
          ),
          ...waitingFlags(
            phaseOf(gate, now),
            gate.opensAt,
            now,
            deviceStatusOf(
              devices.filter((device) => device.sessionId === gate.sessionId),
              hash,
            ),
          ),
        };
      }),
    };
  }

  // --- Bắt đầu và xem (Q230, Q232) -----------------------------------------------------------------------------------

  /** Bắt đầu Lượt mới hoặc làm tiếp Lượt đang mở. */
  async start(userId: string, deviceKey: string | undefined, sessionId: string) {
    // Lượt đang dở đã quá ân hạn thì đóng (hết giờ) trong giao dịch riêng: nếu để chung, một lỗi ở các bước sau sẽ hủy luôn
    // việc nộp này và Lượt cứ treo đến khi job quét chạy.
    await this.closeOverdue(userId, sessionId);
    const attemptId = await this.db.transaction(async (tx) => {
      // Khóa Phiên thi `FOR SHARE` ngay câu đầu (cùng thứ tự khóa với Hủy, Thu hồi, Bớt người): không bế tắc, và nếu vừa bị
      // Hủy thì thấy đã Hủy chứ không tạo Lượt mồ côi.
      // Giữ chỗ tài khoản trước Phiên thi (cùng thứ tự khóa với Khóa, Xóa người dùng): người vừa bị Khóa không mở Lượt mới.
      if (!(await this.directory.holdActive(tx, userId))) throw new ApiError('UNAUTHENTICATED');
      const gate = await this.entry.gateFor(sessionId, userId, tx, { lock: true });
      if (!gate) throw new ApiError('NOT_FOUND');
      await this.requireDevice(tx, sessionId, userId, deviceKey);
      const now = this.clock.now();

      const running = await this.inProgressOf(tx, sessionId, userId);
      if (running && !isPastGrace(running.deadline, now)) return running.id;

      // Đình chỉ chặn Lượt mới trong Phiên thi đó, kể cả khi còn lượt (Q272); Buộc nộp chỉ đóng Lượt nên không chặn.
      const [suspended] = await tx
        .select({ id: violations.id })
        .from(violations)
        .where(
          and(
            eq(violations.sessionId, sessionId),
            eq(violations.userId, userId),
            eq(violations.action, 'disqualify'),
          ),
        )
        .limit(1);
      if (suspended) throw invalidState('DISQUALIFIED');

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
      const layoutInput = layoutInputOf(content);
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
    this.realtime.sessionChanged(sessionId);
    return this.view(userId, deviceKey, attemptId);
  }

  /** Đóng (hết giờ) Lượt đang dở của người này nếu đã quá hạn cộng ân hạn; giao dịch riêng, chạy xong là bền. */
  private async closeOverdue(userId: string, sessionId: string) {
    await this.db.transaction(async (tx) => {
      const running = await this.inProgressOf(tx, sessionId, userId);
      const now = this.clock.now();
      if (running && isPastGrace(running.deadline, now)) {
        await this.closeOne(tx, running.id, 'timeout', now);
      }
    });
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
      saved.map((row) => [
        row.itemId,
        { value: row.value, flagged: row.flagged, clientSeq: row.clientSeq },
      ]),
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
    await this.requestLimiter.hit('save', userId, SAVE_LIMIT);
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

    const saved = await this.db.transaction(async (tx) => {
      const gate = await this.entry.gateFor(first.sessionId, userId, tx);
      if (!gate) throw new ApiError('NOT_FOUND');
      await this.requireDevice(tx, first.sessionId, userId, deviceKey);
      const [attempt] = await tx
        .select()
        .from(attempts)
        .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
        .for('share');
      if (attempt?.status !== 'in_progress') throw invalidState('ATTEMPT_CLOSED');
      // Kiểm lại hạn sau khi nhận khóa: nếu phải chờ Thu hồi hay Nộp bài thì giờ đã trôi. Job quét sẽ đóng Lượt này.
      if (isPastGrace(attempt.deadline, this.clock.now())) throw invalidState('ATTEMPT_CLOSED');

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
    this.realtime.sessionChanged(first.sessionId);
    return saved;
  }

  /** Nộp bài; nộp lần hai trả lại trạng thái đã nộp (an toàn khi mạng chập chờn gửi lặp). */
  async submit(userId: string, deviceKey: string | undefined, attemptId: string) {
    const state = await this.db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(attempts)
        .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
        .for('update');
      if (!attempt) throw new ApiError('NOT_FOUND');
      if (attempt.status === 'submitted') {
        return {
          sessionId: attempt.sessionId,
          view: this.submittedState(attempt, this.clock.now()),
        };
      }
      await this.requireDevice(tx, attempt.sessionId, userId, deviceKey);
      const now = this.clock.now();
      const reason: SubmitReason = this.pastGrace(attempt, now) ? 'timeout' : 'candidate';
      await this.closeOne(tx, attemptId, reason, now);
      return {
        sessionId: attempt.sessionId,
        view: this.submittedState(await this.ownAttempt(tx, userId, attemptId), now),
      };
    });
    this.realtime.sessionChanged(state.sessionId);
    return state.view;
  }

  // --- Đóng Lượt ------------------------------------------------------------------------------------------------------

  /** Nộp một Lượt đang làm; không làm gì nếu đã nộp. Trả `true` nếu vừa đóng. */
  async closeOne(executor: Executor, attemptId: string, reason: SubmitReason, now: Date) {
    return (await closeInProgress(executor, eq(attempts.id, attemptId), reason, now)).length > 0;
  }

  // --- Phụ trợ ---------------------------------------------------------------------------------------------------------

  private pastGrace(attempt: AttemptRow, now: Date) {
    return isPastGrace(attempt.deadline, now);
  }

  private submittedState(attempt: AttemptRow, now: Date) {
    return {
      status: 'submitted' as const,
      attempt: {
        id: attempt.id,
        attemptNo: attempt.attemptNo,
        submittedAt: attempt.submittedAt,
        /** Vì sao Lượt kết thúc (Q244): tự nộp, hết giờ, bị Hủy Phiên thi… */
        submitReason: attempt.submitReason,
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

/**
 * Thiết bị này với Phiên thi: `active` (đã vào, dùng được), `revoked` (đã bị thu hồi), `other` (người này đang dùng thiết bị khác),
 * `none` (chưa có thiết bị nào đang gắn, cần nhập Mã vào thi).
 */
/** `canWait`: đã tới cửa sổ Phòng chờ (nhập mã được); `waitingRoom`: đã nhập mã trên thiết bị này và đang chờ giờ mở. */
function waitingFlags(
  phase: SessionPhase,
  opensAt: Date,
  now: Date,
  device: 'active' | 'revoked' | 'other' | 'none',
) {
  const canWait = canEnterWaitingRoom(phase, opensAt, now);
  return { canWait, waitingRoom: canWait && device === 'active' };
}

function deviceStatusOf(
  rows: { status: 'active' | 'revoked'; deviceHash: string }[],
  hash: string | undefined,
): 'active' | 'revoked' | 'other' | 'none' {
  const mine = rows.find((row) => row.deviceHash === hash);
  if (mine) return mine.status;
  return rows.some((row) => row.status === 'active') ? 'other' : 'none';
}
