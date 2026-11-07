import { randomInt } from 'node:crypto';
import {
  generateAccessCode,
  normalizeForSearch,
  phaseOf,
  type SessionPhase,
  type SessionSettings,
  type SessionUpdate,
  sessionChangeProblems,
} from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNotNull, isNull, lte, or, type SQL, sql } from 'drizzle-orm';
import { ApiError, validationFailed } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { EXAM_CATALOG, type ExamCatalog } from '../../common/exam-catalog';
import { SESSION_GRADING_STATUS, type SessionGradingStatus } from '../../common/grading-status';
import { type Page, paginate } from '../../common/pagination';
import { exclusionViolationOf } from '../../common/pg-error';
import { escapeLike } from '../../common/sql-like';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { NotificationsService } from '../notifications/notifications.service';
import { sessions } from './session.schema';
import { lockOwnedSession, notifyRoster } from './session-access';

const SUGGEST_ATTEMPTS = 10;

type Db = Pick<Database, 'select'>;

/** Điều kiện SQL cho từng trạng thái, cùng luật với `phaseOf` ở `@exam/shared`. */
function phaseCondition(phase: SessionPhase, now: Date): SQL {
  switch (phase) {
    case 'cancelled':
      return isNotNull(sessions.cancelledAt) as SQL;
    case 'upcoming':
      return and(isNull(sessions.cancelledAt), gt(sessions.opensAt, now)) as SQL;
    case 'closed':
      return and(isNull(sessions.cancelledAt), sql`${sessions.closesAt} < ${now}`) as SQL;
    case 'entry_closed':
      return and(
        isNull(sessions.cancelledAt),
        lte(sessions.opensAt, now),
        sql`${sessions.closesAt} >= ${now}`,
        isNotNull(sessions.entryClosedAt),
        lte(sessions.entryClosedAt, now),
      ) as SQL;
    case 'open':
      return and(
        isNull(sessions.cancelledAt),
        lte(sessions.opensAt, now),
        sql`${sessions.closesAt} >= ${now}`,
        or(isNull(sessions.entryClosedAt), gt(sessions.entryClosedAt, now)),
      ) as SQL;
  }
}

/** Phiên thi của Người ra đề (Q192–Q222). Mọi truy cập lọc theo `owner_id`; của người khác coi như không tồn tại. */
/** Nhãn Đã Công bố, Đã Chốt của Phiên thi (Q299): hiện ở danh sách và chi tiết, và để khóa nút Hủy. */
const releaseFlags = (states: Map<string, { finalizedAt: Date | null }>, id: string) => ({
  resultReleased: states.has(id),
  resultFinalized: states.get(id)?.finalizedAt != null,
});

@Injectable()
export class SessionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EXAM_CATALOG) private readonly exams: ExamCatalog,
    private readonly notifications: NotificationsService,
    @Inject(SESSION_GRADING_STATUS) private readonly gradingStatus: SessionGradingStatus,
  ) {}

  async create(ownerId: string, input: SessionSettings) {
    const id = await this.db.transaction((tx) => this.createWithin(tx, ownerId, input));
    return this.detail(this.db, ownerId, id);
  }

  /** Tạo trong giao dịch của bên gọi (Nhân bản); trả id Phiên thi mới. */
  async createWithin(tx: Transaction, ownerId: string, input: SessionSettings): Promise<string> {
    await this.requireUsableExam(ownerId, input.examId);
    return this.insert(tx, ownerId, input);
  }

  /**
   * Sửa theo trạng thái (Q202): trường nào đổi được phụ thuộc `phaseOf`. Khóa dòng để hai lần sửa không chồng nhau,
   * `version` lệch là CONFLICT.
   */
  async update(ownerId: string, id: string, input: SessionUpdate) {
    await this.db.transaction(async (tx) => {
      const current = await lockOwnedSession(tx, ownerId, id);
      if (current.version !== input.version) throw new ApiError('CONFLICT', { field: 'version' });

      const { version: _version, ...settings } = input;
      const next = { ...settings, accessCode: settings.accessCode ?? current.accessCode };
      const problems = sessionChangeProblems(phaseOf(current, this.clock.now()), current, next);
      if (problems.length > 0)
        throw new ApiError('VALIDATION_FAILED', {
          issues: problems.map(({ path, code }) => ({ path, code })),
        });
      if (next.examId !== current.examId) await this.requireUsableExam(ownerId, next.examId);
      // Đã Công bố thì không đổi "Cho xem lại đề" nữa (Q297).
      if (next.reviewAfterRelease !== current.reviewAfterRelease) {
        if ((await this.gradingStatus.releaseStates([id], tx)).has(id)) {
          throw new ApiError('INVALID_STATE', { reason: 'ALREADY_RELEASED' });
        }
      }

      try {
        await tx
          .update(sessions)
          .set({ ...next, version: sql`${sessions.version} + 1` })
          .where(eq(sessions.id, id));
      } catch (error) {
        if (exclusionViolationOf(error)) throw new ApiError('CONFLICT', { field: 'accessCode' });
        throw error;
      }

      // Q211: đổi giờ mở hoặc đóng thì báo mọi người trong Danh sách.
      if (
        next.opensAt.getTime() !== current.opensAt.getTime() ||
        next.closesAt.getTime() !== current.closesAt.getTime()
      ) {
        await notifyRoster(this.notifications, tx, id, 'session.rescheduled', {
          sessionId: id,
          title: next.title,
          opensAt: next.opensAt,
          closesAt: next.closesAt,
        });
      }
    });
    return this.detail(this.db, ownerId, id);
  }

  /** Mã chưa dùng trong Khung giờ này, để giao diện gợi ý ở bước Thiết lập. */
  async suggestAccessCode(opensAt: Date, closesAt: Date): Promise<{ accessCode: string }> {
    for (let i = 0; i < SUGGEST_ATTEMPTS; i++) {
      const code = generateAccessCode(randomInt);
      if (!(await this.codeTaken(this.db, code, opensAt, closesAt))) return { accessCode: code };
    }
    throw new Error('Không sinh được Mã vào thi chưa dùng');
  }

  async list(ownerId: string, filter: { phase?: SessionPhase; q?: string }, page: Page) {
    const now = this.clock.now();
    const q = filter.q ? normalizeForSearch(filter.q) : '';
    const where = and(
      eq(sessions.ownerId, ownerId),
      filter.phase ? phaseCondition(filter.phase, now) : undefined,
      q ? sql`unaccent(lower(${sessions.title})) LIKE ${`%${escapeLike(q)}%`}` : undefined,
    );
    const result = await paginate(
      page,
      () => this.db.select({ total: sql<number>`count(*)::int` }).from(sessions).where(where),
      (limit, offset) =>
        this.db
          .select({
            ...this.summaryColumns(),
          })
          .from(sessions)
          .where(where)
          .orderBy(desc(sessions.opensAt), desc(sessions.id))
          .limit(limit)
          .offset(offset),
    );
    const titles = await this.exams.titlesOf(result.items.map((row) => row.examId));
    const states = await this.gradingStatus.releaseStates(result.items.map((row) => row.id));
    return {
      ...result,
      items: result.items.map((row) => ({
        ...this.present(row, titles, now),
        ...releaseFlags(states, row.id),
      })),
    };
  }

  get(ownerId: string, id: string) {
    return this.detail(this.db, ownerId, id);
  }

  private summaryColumns() {
    return {
      id: sessions.id,
      examId: sessions.examId,
      title: sessions.title,
      opensAt: sessions.opensAt,
      closesAt: sessions.closesAt,
      durationMinutes: sessions.durationMinutes,
      hardClose: sessions.hardClose,
      maxAttempts: sessions.maxAttempts,
      attemptScoring: sessions.attemptScoring,
      shuffleItems: sessions.shuffleItems,
      shuffleOptions: sessions.shuffleOptions,
      showScoringRules: sessions.showScoringRules,
      reviewAfterRelease: sessions.reviewAfterRelease,
      accessCode: sessions.accessCode,
      entryClosedAt: sessions.entryClosedAt,
      cancelledAt: sessions.cancelledAt,
      cancelReason: sessions.cancelReason,
      version: sessions.version,
      // Viết tên bảng đầy đủ: drizzle bỏ tiền tố bảng trong truy vấn một bảng.
      rosterCount: sql<number>`(select count(*)::int from session_roster where session_roster.session_id = sessions.id)`,
    };
  }

  private present<
    T extends {
      examId: string;
      opensAt: Date;
      closesAt: Date;
      entryClosedAt: Date | null;
      cancelledAt: Date | null;
    },
  >(row: T, titles: Map<string, string>, now: Date) {
    return { ...row, examTitle: titles.get(row.examId) ?? '', phase: phaseOf(row, now) };
  }

  protected async detail(db: Db, ownerId: string, id: string) {
    const [row] = await db
      .select(this.summaryColumns())
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.ownerId, ownerId)));
    if (!row) throw new ApiError('NOT_FOUND');
    const states = await this.gradingStatus.releaseStates([row.id]);
    return {
      ...this.present(row, await this.exams.titlesOf([row.examId]), this.clock.now()),
      ...releaseFlags(states, row.id),
    };
  }

  /** Bộ đề phải của chính người tạo và đã Phát hành, chưa Lưu trữ (Q203). */
  private async requireUsableExam(ownerId: string, examId: string) {
    const status = await this.exams.statusOwnedBy(ownerId, examId);
    if (!status) throw validationFailed('examId', 'unknown_exam');
    if (status === 'draft') throw validationFailed('examId', 'exam_not_published');
    if (status === 'archived') throw validationFailed('examId', 'exam_archived');
  }

  private async codeTaken(db: Db, code: string, opensAt: Date, closesAt: Date, exceptId?: string) {
    const [row] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.accessCode, code),
          isNull(sessions.cancelledAt),
          exceptId ? sql`${sessions.id} <> ${exceptId}` : undefined,
          sql`tstzrange(${sessions.opensAt}, ${sessions.closesAt}, '[]') && tstzrange(${opensAt}, ${closesAt}, '[]')`,
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /** Mã người dùng đặt trùng thì CONFLICT ở `accessCode`; mã tự sinh trùng (hiếm) thì thử mã khác. */
  private async insert(tx: Transaction, ownerId: string, input: SessionSettings) {
    const { accessCode, ...rest } = input;
    for (let attempt = 0; ; attempt++) {
      const code =
        accessCode ?? (await this.suggestAccessCode(input.opensAt, input.closesAt)).accessCode;
      try {
        // Điểm lưu: lỗi ràng buộc làm hỏng giao dịch, nên thử lại phải nằm trong savepoint.
        return await tx.transaction(async (inner) => {
          const [row] = await inner
            .insert(sessions)
            .values({ ...rest, ownerId, accessCode: code })
            .returning({ id: sessions.id });
          if (!row) throw new Error('Không tạo được Phiên thi');
          return row.id;
        });
      } catch (error) {
        if (!exclusionViolationOf(error)) throw error;
        if (accessCode || attempt >= SUGGEST_ATTEMPTS)
          throw new ApiError('CONFLICT', { field: 'accessCode' });
      }
    }
  }
}
