import { normalizeForSearch, SESSION_ROSTER_MAX } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import {
  CANDIDATE_DIRECTORY,
  type CandidateDirectory,
  type CandidateSelector,
  type CandidateSort,
} from '../../common/candidate-directory';
import { CLOCK, type Clock } from '../../common/clock';
import { type Page } from '../../common/pagination';
import { REALTIME_NOTIFIER, type RealtimeNotifier } from '../../common/realtime-notifier';
import { SESSION_ATTEMPTS, type SessionAttempts } from '../../common/session-attempts';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { RequesterCredentialsService } from '../identity/account-requests/requester-credentials.service';
import { NotificationsService } from '../notifications/notifications.service';
import { sessionRoster } from './session.schema';
import { findOwnedSession, lockOwnedSession, requireNotOver } from './session-access';

const SEARCH_USERS = 20;
const SEARCH_CLASSES = 10;

export type RosterSelector = CandidateSelector;

export type IneligibleReason = 'owner_cannot_sit' | 'locked' | 'not_candidate';

export interface RosterAddResult {
  added: number;
  alreadyIn: number;
  notFound: string[];
  ineligible: { userId: string; reason: IneligibleReason }[];
  dryRun: boolean;
}

/** Danh sách dự thi (Q200): ai được phép dự thi một Phiên thi. */
@Injectable()
export class SessionRosterService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CANDIDATE_DIRECTORY) private readonly directory: CandidateDirectory,
    @Inject(SESSION_ATTEMPTS) private readonly attempts: SessionAttempts,
    private readonly audit: AuditService,
    @Inject(REALTIME_NOTIFIER) private readonly realtime: RealtimeNotifier,
    private readonly notifications: NotificationsService,
    private readonly credentials: RequesterCredentialsService,
  ) {}

  async list(
    ownerId: string,
    sessionId: string,
    filter: { q?: string; sort?: CandidateSort },
    page: Page,
  ) {
    await findOwnedSession(this.db, ownerId, sessionId);
    // Danh sách tối đa 500 người: lấy hết dòng của Phiên thi rồi nhờ danh bạ lọc, xếp và cắt trang theo hồ sơ.
    const members = await this.db
      .select({
        userId: sessionRoster.userId,
        classLabel: sessionRoster.classLabel,
        extraMinutes: sessionRoster.extraMinutes,
        addedAt: sessionRoster.addedAt,
      })
      .from(sessionRoster)
      .where(eq(sessionRoster.sessionId, sessionId));
    const byUser = new Map(members.map((member) => [member.userId, member]));
    const { total, items } = await this.directory.page([...byUser.keys()], {
      q: filter.q,
      sort: filter.sort,
      limit: page.pageSize,
      offset: (page.page - 1) * page.pageSize,
    });
    // Thiết bị và số Lượt do module `attempt` giữ (Q234): Người ra đề thấy thiết bị lạ để Thu hồi.
    const [devices, counts] = await Promise.all([
      this.attempts.devicesOf(sessionId),
      this.attempts.attemptCounts(sessionId),
    ]);
    return {
      total,
      page: page.page,
      pageSize: page.pageSize,
      items: items.map((person) => {
        const member = byUser.get(person.id);
        if (!member) throw new Error(`Danh bạ trả người ngoài Danh sách: ${person.id}`);
        const own = devices.get(person.id) ?? [];
        const active = own.find((device) => device.status === 'active');
        const present = (device: (typeof own)[number]) => ({
          id: device.deviceId,
          status: device.status,
          ip: device.ip,
          userAgent: device.userAgent,
          boundAt: device.boundAt,
          revokedAt: device.revokedAt,
        });
        return {
          userId: person.id,
          code: person.code,
          fullName: person.fullName,
          classLabel: member.classLabel,
          extraMinutes: member.extraMinutes,
          addedAt: member.addedAt,
          attemptCount: counts.get(person.id) ?? 0,
          device: active ? present(active) : null,
          revokedDevices: own.filter((device) => device.status === 'revoked').map(present),
        };
      }),
    };
  }

  /** Gợi ý người và Lớp để thêm; mỗi người kèm cờ đã có trong Danh sách. */
  async search(ownerId: string, sessionId: string, rawQuery: string) {
    await findOwnedSession(this.db, ownerId, sessionId);
    if (!normalizeForSearch(rawQuery)) return { users: [], classes: [] };
    const { users, classes } = await this.directory.search(rawQuery, {
      excludeUserId: ownerId,
      userLimit: SEARCH_USERS,
      classLimit: SEARCH_CLASSES,
    });
    const inRoster = new Set(
      users.length === 0
        ? []
        : (
            await this.db
              .select({ userId: sessionRoster.userId })
              .from(sessionRoster)
              .where(
                and(
                  eq(sessionRoster.sessionId, sessionId),
                  inArray(
                    sessionRoster.userId,
                    users.map((user) => user.id),
                  ),
                ),
              )
          ).map((row) => row.userId),
    );
    return {
      users: users.map(({ id, ...rest }) => ({ userId: id, ...rest, inRoster: inRoster.has(id) })),
      classes,
    };
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

      const { people, notFound } = await this.directory.resolve(selector, tx);
      const ineligible: RosterAddResult['ineligible'] = [];
      const eligible: typeof people = [];
      for (const person of people) {
        const reason: IneligibleReason | null =
          person.id === ownerId
            ? 'owner_cannot_sit'
            : person.removed || !person.isCandidate
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
      // Q217: người đã có Lượt làm bài không bị bớt (khóa ngoại cũng chặn); từ chối cả yêu cầu, không bớt dở dang.
      const counts = await this.attempts.attemptCounts(sessionId);
      const withAttempts = userIds.filter((id) => (counts.get(id) ?? 0) > 0);
      if (withAttempts.length > 0) {
        throw new ApiError('INVALID_STATE', { reason: 'HAS_ATTEMPTS', userIds: withAttempts });
      }
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

  /** Thu hồi thiết bị đang gắn của một người (ADR-0007): máy cũ bị chặn ngay, máy mới nhập mã sẽ làm tiếp Lượt cũ. */
  async revokeDevice(actor: Actor, sessionId: string, userId: string, reason: string | null) {
    await this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, actor.id, sessionId);
      if (session.cancelledAt) throw new ApiError('INVALID_STATE', { reason: 'SESSION_CANCELLED' });
      await this.requireMember(tx, sessionId, userId);
      const revoked = await this.attempts.revokeDevice(tx, {
        sessionId,
        userId,
        by: actor.id,
        reason,
        now: this.clock.now(),
      });
      if (!revoked) throw new ApiError('INVALID_STATE', { reason: 'NO_ACTIVE_DEVICE' });
      await this.audit.record(
        {
          actor,
          action: 'session.device_revoked',
          entityType: 'session',
          entityId: sessionId,
          after: { userId, reason },
        },
        tx,
      );
    });
    await this.tellDevice(sessionId, userId);
    return { ok: true };
  }

  /** "Cho thiết bị này vào lại" (thu hồi nhầm): thiết bị đang gắn khác, nếu có, bị thu hồi trong cùng thao tác. */
  async pardonDevice(actor: Actor, sessionId: string, userId: string, deviceId: string) {
    await this.db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, actor.id, sessionId);
      if (session.cancelledAt) throw new ApiError('INVALID_STATE', { reason: 'SESSION_CANCELLED' });
      await this.requireMember(tx, sessionId, userId);
      const done = await this.attempts.pardonDevice(tx, {
        sessionId,
        userId,
        deviceId,
        by: actor.id,
        now: this.clock.now(),
      });
      if (!done) throw new ApiError('NOT_FOUND');
      await this.audit.record(
        {
          actor,
          action: 'session.device_pardoned',
          entityType: 'session',
          entityId: sessionId,
          after: { userId, deviceId },
        },
        tx,
      );
    });
    await this.tellDevice(sessionId, userId);
    return { ok: true };
  }

  /** Thiết bị đổi: Người dự thi đang làm gửi heartbeat ngay (biết bị chặn hay được vào lại), màn Theo dõi tải lại. */
  private async tellDevice(sessionId: string, userId: string) {
    this.realtime.attemptNudge(await this.attempts.liveAttemptIds(sessionId, [userId]));
    this.realtime.sessionChanged(sessionId);
  }

  private async requireMember(tx: Transaction, sessionId: string, userId: string) {
    const [member] = await tx
      .select({ userId: sessionRoster.userId })
      .from(sessionRoster)
      .where(and(eq(sessionRoster.sessionId, sessionId), eq(sessionRoster.userId, userId)));
    if (!member) throw new ApiError('NOT_FOUND');
  }
}
