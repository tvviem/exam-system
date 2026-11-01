import { normalizeForSearch, SESSION_ROSTER_MAX } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { type Page, paginate } from '../../common/pagination';
import { escapeLike } from '../../common/sql-like';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { RequesterCredentialsService } from '../identity/account-requests/requester-credentials.service';
import { users } from '../identity/identity.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { sessionRoster } from './session.schema';
import { findOwnedSession, lockOwnedSession, requireNotOver } from './session-access';

const SEARCH_USERS = 20;
const SEARCH_CLASSES = 10;

export type RosterSelector = { userIds: string[] } | { classLabel: string } | { codes: string[] };

export type IneligibleReason = 'owner_cannot_sit' | 'locked' | 'not_candidate';

export interface RosterAddResult {
  added: number;
  alreadyIn: number;
  notFound: string[];
  ineligible: { userId: string; reason: IneligibleReason }[];
  dryRun: boolean;
}

/** Người mang Nhãn Người dự thi, chưa Khóa hay Xóa, không phải chủ Phiên thi: được thêm vào Danh sách (Q200). */
const hasCandidateTag = sql`exists (select 1 from user_role_tags where user_role_tags.user_id = users.id and user_role_tags.tag = 'candidate')`;

/** Danh sách dự thi (Q200): ai được phép dự thi một Phiên thi. */
@Injectable()
export class SessionRosterService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly credentials: RequesterCredentialsService,
  ) {}

  async list(ownerId: string, sessionId: string, filter: { q?: string }, page: Page) {
    await findOwnedSession(this.db, ownerId, sessionId);
    const q = filter.q ? normalizeForSearch(filter.q) : '';
    const where = and(
      eq(sessionRoster.sessionId, sessionId),
      q
        ? sql`(unaccent(lower(${users.fullName})) LIKE ${`%${escapeLike(q)}%`} OR lower(${users.code}) LIKE ${`%${escapeLike(q)}%`})`
        : undefined,
    );
    return paginate(
      page,
      () =>
        this.db
          .select({ total: sql<number>`count(*)::int` })
          .from(sessionRoster)
          .innerJoin(users, eq(users.id, sessionRoster.userId))
          .where(where),
      (limit, offset) =>
        this.db
          .select({
            userId: sessionRoster.userId,
            code: users.code,
            fullName: users.fullName,
            classLabel: sessionRoster.classLabel,
            extraMinutes: sessionRoster.extraMinutes,
            addedAt: sessionRoster.addedAt,
          })
          .from(sessionRoster)
          .innerJoin(users, eq(users.id, sessionRoster.userId))
          .where(where)
          // Cách xếp danh sách lớp ở Việt Nam: theo tên gọi (từ cuối), rồi họ và tên lót.
          .orderBy(
            sql`unaccent(lower(regexp_replace(${users.fullName}, '^.*\\s', '')))`,
            sql`unaccent(lower(${users.fullName}))`,
            users.id,
          )
          .limit(limit)
          .offset(offset),
    );
  }

  /** Gợi ý người và Lớp để thêm; mỗi người kèm cờ đã có trong Danh sách. */
  async search(ownerId: string, sessionId: string, rawQuery: string) {
    await findOwnedSession(this.db, ownerId, sessionId);
    const q = normalizeForSearch(rawQuery);
    if (!q) return { users: [], classes: [] };
    const like = `%${escapeLike(q)}%`;
    const eligible = and(
      isNull(users.removedAt),
      eq(users.status, 'active'),
      hasCandidateTag,
      sql`${users.id} <> ${ownerId}`,
    );
    const found = await this.db
      .select({
        userId: users.id,
        code: users.code,
        fullName: users.fullName,
        classLabel: users.classLabel,
        inRoster: sql<boolean>`exists (select 1 from session_roster where session_roster.session_id = ${sessionId} and session_roster.user_id = users.id)`,
      })
      .from(users)
      .where(
        and(
          eligible,
          sql`(unaccent(lower(${users.fullName})) LIKE ${like} OR lower(${users.code}) LIKE ${like})`,
        ),
      )
      .orderBy(sql`unaccent(lower(${users.fullName}))`, users.id)
      .limit(SEARCH_USERS);
    const classes = await this.db
      .select({ label: sql<string>`${users.classLabel}`, count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eligible, sql`unaccent(lower(${users.classLabel})) LIKE ${like}`))
      .groupBy(users.classLabel)
      .orderBy(users.classLabel)
      .limit(SEARCH_CLASSES);
    return { users: found, classes };
  }

  /**
   * Thêm người vào Danh sách, hoặc chỉ báo trước kết quả khi `dryRun`. Khóa dòng Phiên thi để hai lần thêm cùng lúc
   * không vượt 500. Lớp được chụp tại lúc thêm (Q200).
   */
  async add(
    ownerId: string,
    sessionId: string,
    selector: RosterSelector,
    dryRun: boolean,
  ): Promise<RosterAddResult> {
    return this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, ownerId, sessionId);
      requireNotOver(session, this.clock.now());

      const { people, notFound } = await this.resolve(tx, selector);
      const ineligible: RosterAddResult['ineligible'] = [];
      const eligible: typeof people = [];
      for (const person of people) {
        const reason: IneligibleReason | null =
          person.id === ownerId
            ? 'owner_cannot_sit'
            : person.removedAt || !person.isCandidate
              ? 'not_candidate'
              : person.status === 'locked'
                ? 'locked'
                : null;
        if (reason) ineligible.push({ userId: person.id, reason });
        else eligible.push(person);
      }

      const existing = new Set(
        (
          await tx
            .select({ userId: sessionRoster.userId })
            .from(sessionRoster)
            .where(eq(sessionRoster.sessionId, sessionId))
        ).map((row) => row.userId),
      );
      const fresh = eligible.filter((person) => !existing.has(person.id));
      if (existing.size + fresh.length > SESSION_ROSTER_MAX)
        throw new ApiError('INVALID_STATE', {
          reason: 'ROSTER_FULL',
          limit: SESSION_ROSTER_MAX,
          current: existing.size,
          adding: fresh.length,
        });

      const result: RosterAddResult = {
        added: fresh.length,
        alreadyIn: eligible.length - fresh.length,
        notFound,
        ineligible,
        dryRun,
      };
      if (dryRun || fresh.length === 0) return result;

      await tx.insert(sessionRoster).values(
        fresh.map((person) => ({
          sessionId,
          userId: person.id,
          addedBy: ownerId,
          classLabel: person.classLabel,
        })),
      );
      await this.notifications.notify(
        {
          userIds: fresh.map((person) => person.id),
          type: 'session.added',
          data: {
            sessionId,
            title: session.title,
            opensAt: session.opensAt,
            closesAt: session.closesAt,
          },
        },
        tx,
      );
      return result;
    });
  }

  /** Bớt người khỏi Danh sách; người không có trong Danh sách thì bỏ qua. */
  async remove(ownerId: string, sessionId: string, userIds: string[]) {
    return this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, ownerId, sessionId);
      requireNotOver(session, this.clock.now());
      const removed = await tx
        .delete(sessionRoster)
        .where(and(eq(sessionRoster.sessionId, sessionId), inArray(sessionRoster.userId, userIds)))
        .returning({ userId: sessionRoster.userId });
      return { removed: removed.length };
    });
  }

  /** Phút cộng sẵn cho riêng một người (ví dụ hỗ trợ đặc biệt). */
  async setExtraMinutes(ownerId: string, sessionId: string, userId: string, extraMinutes: number) {
    return this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, ownerId, sessionId);
      requireNotOver(session, this.clock.now());
      const [row] = await tx
        .update(sessionRoster)
        .set({ extraMinutes })
        .where(and(eq(sessionRoster.sessionId, sessionId), eq(sessionRoster.userId, userId)))
        .returning({ userId: sessionRoster.userId, extraMinutes: sessionRoster.extraMinutes });
      if (!row) throw new ApiError('NOT_FOUND');
      return row;
    });
  }

  /** Cấp lại mật khẩu tạm cho một người trong Danh sách; điều kiện chi tiết ở `RequesterCredentialsService`. */
  async reissuePassword(actor: Actor, sessionId: string, userId: string) {
    const session = await findOwnedSession(this.db, actor.id, sessionId);
    requireNotOver(session, this.clock.now());
    const [member] = await this.db
      .select({ userId: sessionRoster.userId })
      .from(sessionRoster)
      .where(and(eq(sessionRoster.sessionId, sessionId), eq(sessionRoster.userId, userId)));
    if (!member) throw new ApiError('NOT_FOUND');
    return this.credentials.reissueTemporaryPassword(actor, userId, { sessionId });
  }

  private async resolve(tx: Transaction, selector: RosterSelector) {
    const columns = {
      id: users.id,
      code: users.code,
      classLabel: users.classLabel,
      status: users.status,
      removedAt: users.removedAt,
      isCandidate: sql<boolean>`${hasCandidateTag}`,
    };
    const find = (where: SQL | undefined) => tx.select(columns).from(users).where(where);
    if ('userIds' in selector) {
      const people = await find(inArray(users.id, selector.userIds));
      const known = new Set(people.map((p) => p.id));
      // Id không có trong hệ thống: không phải Người dự thi.
      const unknown = selector.userIds.filter((id) => !known.has(id));
      return {
        people: [...people, ...unknown.map((id) => ({ ...BLANK, id }))],
        notFound: [],
      };
    }
    if ('classLabel' in selector) {
      const people = await find(
        and(
          isNull(users.removedAt),
          sql`lower(${users.classLabel}) = lower(${selector.classLabel})`,
        ),
      );
      return { people, notFound: [] };
    }
    // Mã không phân biệt hoa thường; mã trùng trong danh sách dán chỉ tính một lần.
    const unique = new Map(selector.codes.map((code) => [code.toLowerCase(), code]));
    const people = await find(
      and(isNull(users.removedAt), inArray(sql`lower(${users.code})`, [...unique.keys()])),
    );
    const matched = new Set(people.map((p) => p.code?.toLowerCase()));
    const notFound = [...unique].filter(([key]) => !matched.has(key)).map(([, code]) => code);
    return { people, notFound };
  }
}

const BLANK = {
  code: null,
  classLabel: null,
  status: 'active' as const,
  removedAt: new Date(0),
  isCandidate: false,
};
