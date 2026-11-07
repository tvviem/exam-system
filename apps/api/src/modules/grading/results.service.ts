import { fromCenti, type PenaltyInput, resultOf } from '@exam/scoring';
import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error';
import { CANDIDATE_DIRECTORY, type CandidateDirectory } from '../../common/candidate-directory';
import { GRADING_SESSIONS, type GradingSessions } from '../../common/grading-sessions';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import {
  VIOLATION_PENALTIES,
  type ViolationPenalties,
  type ViolationRecord,
} from '../../common/violation-penalties';
import { GradingAccessService } from './grading-access.service';
import { type GradingContext, GradingContextService } from './grading-context.service';
import { ReleaseService } from './release.service';

/** Dòng của bảng Kết quả (docs/plan/slice-5.md, PR 5b). */
export interface ResultRow {
  userId: string;
  code: string | null;
  fullName: string;
  classLabel: string | null;
  attemptCount: number;
  /** `hidden`: Chấm ẩn tên đang che điểm tự luận nên không nói người này đã được chấm hết hay chưa (Q291). */
  state: 'no_attempt' | 'hidden' | 'waiting_essay' | 'graded';
  /** Số câu tự luận có chữ còn chờ chấm của người này; `null` khi `essayHidden` (đếm theo người sẽ nối "Bài N" với tên). */
  pendingEssays: number | null;
  /** Chấm ẩn tên đang che điểm tự luận: `rawScore` và `scaledScore` chỉ gồm phần trắc nghiệm. */
  essayHidden: boolean;
  rawScore: number | null;
  maxScore: number;
  scaledScore: number | null;
  penaltyPercent: number;
  voided: boolean;
  /** Mã Lượt được tính; vắng khi `essayHidden` để không nối "Bài N" ở màn Chấm với tên người (Q291). */
  countedAttemptId?: string;
}

/** Bỏ mã Lượt khỏi Vi phạm trả ra: ghép nó với hàng đợi chấm ẩn tên sẽ lộ người viết bài (Q291). */
function withoutAttemptId<T extends { attemptId: string }>({
  attemptId: _hidden,
  ...rest
}: T): Omit<T, 'attemptId'> {
  return rest;
}

/** Số Người dự thi thấy, chỉ khi khác số thứ tự gốc của Bộ đề (Q xáo trộn). */
const seenAsOf = (seen: number | undefined, original: number) =>
  seen !== undefined && seen !== original ? seen : null;

const penaltyInput = (violation: ViolationRecord): PenaltyInput => ({
  type: violation.penaltyType,
  percent: violation.penaltyPercent,
});

@Injectable()
export class ResultsService {
  constructor(
    private readonly access: GradingAccessService,
    private readonly context: GradingContextService,
    @Inject(GRADING_SESSIONS) private readonly sessions: GradingSessions,
    @Inject(CANDIDATE_DIRECTORY) private readonly directory: CandidateDirectory,
    @Inject(VIOLATION_PENALTIES) private readonly violations: ViolationPenalties,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    private readonly release: ReleaseService,
  ) {}

  /** Chấm ẩn tên đang bật mà còn bài tự luận chờ chấm: che điểm tự luận (Q291). */
  private hideEssays(ctx: GradingContext, blind: boolean) {
    return blind && this.pendingEssayTotal(ctx) > 0;
  }

  private essayIds(ctx: GradingContext) {
    return new Set(ctx.items.filter((item) => item.type === 'essay').map((item) => item.itemId));
  }

  private pendingEssayTotal(ctx: GradingContext) {
    let total = 0;
    for (const rows of ctx.rows.values()) {
      for (const row of rows) if (row.verdict === 'pending') total++;
    }
    return total;
  }

  async results(userId: string, sessionId: string) {
    return (await this.compute(userId, sessionId, false)).payload;
  }

  /** Dữ liệu cho xuất Excel: như `results` nhưng luôn kèm mã Lượt được tính và trả cả bối cảnh để dựng trang Chi tiết. */
  async exportData(userId: string, sessionId: string) {
    return this.compute(userId, sessionId, true);
  }

  private async compute(userId: string, sessionId: string, withAttemptIds: boolean) {
    const access = await this.access.require(userId, sessionId);
    const ctx = await this.context.load(access.info);
    const release = await this.release.statusOf(access.info, ctx);
    const [blind, violations, roster] = await Promise.all([
      this.access.isBlind(sessionId),
      this.violations.list(sessionId),
      this.sessions.roster(sessionId),
    ]);
    const hide = this.hideEssays(ctx, blind);
    const essays = this.essayIds(ctx);

    const classOf = new Map(roster.map((entry) => [entry.userId, entry.classLabel]));
    const userIds = [
      ...new Set([...roster.map((e) => e.userId), ...ctx.submitted.map((a) => a.userId)]),
    ];
    const profiles = userIds.length
      ? (await this.directory.page(userIds, { limit: userIds.length, offset: 0, sort: 'name' }))
          .items
      : [];
    const penaltiesOf = new Map<string, PenaltyInput[]>();
    for (const violation of violations) {
      const list = penaltiesOf.get(violation.userId) ?? [];
      list.push(penaltyInput(violation));
      penaltiesOf.set(violation.userId, list);
    }
    const attemptsByUser = new Map<string, typeof ctx.countable>();
    for (const attempt of ctx.countable) {
      const list = attemptsByUser.get(attempt.userId) ?? [];
      list.push(attempt);
      attemptsByUser.set(attempt.userId, list);
    }
    const submittedCount = new Map<string, number>();
    for (const attempt of ctx.submitted) {
      submittedCount.set(attempt.userId, (submittedCount.get(attempt.userId) ?? 0) + 1);
    }

    const maxScore = fromCenti(ctx.maxScoreCenti);
    const rows: ResultRow[] = profiles.map((profile) => {
      const attempts = attemptsByUser.get(profile.id) ?? [];
      let pending = 0;
      const scores = attempts.map((attempt) => {
        let total = 0;
        for (const row of ctx.rows.get(attempt.attemptId) ?? []) {
          if (row.verdict === 'pending') pending++;
          if (hide && essays.has(row.itemId)) continue;
          total += row.scoreCenti ?? 0;
        }
        return {
          attemptId: attempt.attemptId,
          attemptNo: attempt.attemptNo,
          rawScore: fromCenti(total),
          maxScore,
        };
      });
      const result = resultOf({
        attempts: scores,
        attemptScoring: access.info.attemptScoring,
        penalties: penaltiesOf.get(profile.id) ?? [],
      });
      const base = {
        userId: profile.id,
        code: profile.code,
        fullName: profile.fullName,
        classLabel: classOf.get(profile.id) ?? null,
        attemptCount: submittedCount.get(profile.id) ?? 0,
        pendingEssays: hide && attempts.length > 0 ? null : pending,
        essayHidden: hide && attempts.length > 0,
        maxScore,
      };
      if (!result) {
        return {
          ...base,
          state: 'no_attempt' as const,
          rawScore: null,
          scaledScore: null,
          penaltyPercent: 0,
          voided: false,
        };
      }
      return {
        ...base,
        state: hide
          ? ('hidden' as const)
          : pending > 0
            ? ('waiting_essay' as const)
            : ('graded' as const),
        rawScore: result.rawScore,
        scaledScore: result.scaledScore,
        penaltyPercent: result.penaltyPercent,
        voided: result.voided,
        ...(hide && !withAttemptIds ? {} : { countedAttemptId: result.countedAttemptId }),
      };
    });

    const payload = {
      release,
      session: {
        sessionId,
        title: access.info.title,
        opensAt: access.info.opensAt,
        closesAt: access.info.closesAt,
        durationMinutes: access.info.durationMinutes,
        attemptScoring: access.info.attemptScoring,
        totalItems: ctx.items.length,
        maxScore,
      },
      role: access.role,
      blind,
      status: {
        submittedAttempts: ctx.submitted.length,
        pendingEssays: this.pendingEssayTotal(ctx),
        violationsUndecided: violations.filter((v) => v.penaltyDecidedAt === null).length,
        essayHidden: hide,
      },
      people: rows,
    };
    return { payload, ctx, access };
  }

  /** Điểm từng câu của một người (các Lượt có thể được tính). */
  async person(userId: string, sessionId: string, targetUserId: string) {
    const access = await this.access.require(userId, sessionId);
    const ctx = await this.context.load(access.info);
    const [blind, violations, roster] = await Promise.all([
      this.access.isBlind(sessionId),
      this.violations.list(sessionId),
      this.sessions.roster(sessionId),
    ]);
    const attempts = ctx.countable.filter((attempt) => attempt.userId === targetUserId);
    const inRoster = roster.find((entry) => entry.userId === targetUserId);
    if (attempts.length === 0 && !inRoster) throw new ApiError('NOT_FOUND');
    const [profile] = (await this.directory.page([targetUserId], { limit: 1, offset: 0 })).items;
    if (!profile) throw new ApiError('NOT_FOUND');
    const hide = this.hideEssays(ctx, blind);
    const essays = this.essayIds(ctx);
    // Số câu Người dự thi đã thấy (đã xáo): chỉ hiện khi Chấm ẩn tên tắt (bật thì đối chiếu số câu với một người sẽ lộ bài nào của ai).
    const seen = blind
      ? new Map<string, Map<string, number>>()
      : await this.source.displayNumbers(attempts.map((attempt) => attempt.attemptId));

    return {
      person: {
        userId: profile.id,
        code: profile.code,
        fullName: profile.fullName,
        classLabel: inRoster?.classLabel ?? null,
      },
      essayHidden: hide,
      attempts: attempts.map((attempt) => {
        const byItem = new Map(
          (ctx.rows.get(attempt.attemptId) ?? []).map((row) => [row.itemId, row]),
        );
        return {
          attemptNo: attempt.attemptNo,
          ...(hide ? {} : { attemptId: attempt.attemptId }),
          submittedAt: attempt.submittedAt,
          items: ctx.items.map((item) => {
            const row = byItem.get(item.itemId);
            const hidden = hide && essays.has(item.itemId);
            return {
              itemId: item.itemId,
              no: item.no,
              // Chỉ khi khác số gốc mới có giá trị (đề không xáo thì không cần ghi chú).
              seenAs: blind
                ? null
                : seenAsOf(seen.get(attempt.attemptId)?.get(item.itemId), item.no),
              type: item.type,
              points: item.points,
              score: hidden || !row || row.scoreCenti === null ? null : fromCenti(row.scoreCenti),
              verdict: hidden ? ('hidden' as const) : (row?.verdict ?? 'pending'),
              source: hidden ? null : (row?.source ?? null),
              feedback: hidden ? null : (row?.feedback ?? null),
            };
          }),
        };
      }),
      violations: violations
        .filter((violation) => violation.userId === targetUserId)
        .map((violation) => {
          const { userId: _userId, ...rest } = withoutAttemptId(violation);
          return rest;
        }),
    };
  }

  /** Thống kê câu (Q305): số đúng / một phần / sai / bỏ trống / chờ chấm của mỗi câu, trên các Lượt có thể được tính. */
  async itemStats(userId: string, sessionId: string) {
    const access = await this.access.require(userId, sessionId);
    const ctx = await this.context.load(access.info);
    const counts = new Map(
      ctx.items.map((item) => [
        item.itemId,
        { correct: 0, partial: 0, wrong: 0, blank: 0, pending: 0 },
      ]),
    );
    for (const rows of ctx.rows.values()) {
      for (const row of rows) {
        const bucket = counts.get(row.itemId);
        if (bucket) bucket[row.verdict]++;
      }
    }
    return {
      attempts: ctx.countable.length,
      items: ctx.items.map((item) => {
        const bucket = counts.get(item.itemId) ?? {
          correct: 0,
          partial: 0,
          wrong: 0,
          blank: 0,
          pending: 0,
        };
        const total =
          bucket.correct + bucket.partial + bucket.wrong + bucket.blank + bucket.pending;
        return {
          itemId: item.itemId,
          no: item.no,
          type: item.type,
          points: item.points,
          ...bucket,
          correctRate: total === 0 ? null : Math.round((bucket.correct / total) * 1000) / 10,
        };
      }),
    };
  }

  /** Vi phạm của Phiên thi kèm tên người (Q294). */
  async violationList(userId: string, sessionId: string) {
    await this.access.require(userId, sessionId);
    const list = await this.violations.list(sessionId);
    const ids = [...new Set(list.map((violation) => violation.userId))];
    const people = ids.length
      ? (await this.directory.page(ids, { limit: ids.length, offset: 0 })).items
      : [];
    const byId = new Map(people.map((person) => [person.id, person]));
    return {
      // Không trả `attemptId`: ghép với hàng đợi chấm ẩn tên sẽ lộ người viết bài (Q291).
      items: list.map((violation) => ({
        ...withoutAttemptId(violation),
        fullName: byId.get(violation.userId)?.fullName ?? null,
        code: byId.get(violation.userId)?.code ?? null,
      })),
    };
  }
}
