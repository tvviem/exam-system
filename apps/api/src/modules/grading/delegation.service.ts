import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { EXAMINER_DIRECTORY, type ExaminerDirectory } from '../../common/examiner-directory';
import { GRADING_SESSIONS, type GradingSessions } from '../../common/grading-sessions';
import { pgErrorOf } from '../../common/pg-error';
import { type Database, DB } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { sessionGradingDelegates } from './grading.schema';

/** Ai thực hiện: chủ Phiên thi (kiểm bằng `ownerId`) hoặc Quản trị viên. */
export interface DelegationCaller {
  actor: Actor;
  admin: boolean;
}

const CANDIDATES_LIMIT = 10;

/** Ủy quyền chấm (Q307): chủ Phiên thi hoặc Quản trị viên cấp và thu hồi; người được Ủy quyền không ủy quyền tiếp. */
@Injectable()
export class DelegationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GRADING_SESSIONS) private readonly sessions: GradingSessions,
    @Inject(EXAMINER_DIRECTORY) private readonly examiners: ExaminerDirectory,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async managed(caller: DelegationCaller, sessionId: string) {
    const info = await this.sessions.info(sessionId);
    if (!info || (!caller.admin && info.ownerId !== caller.actor.id))
      throw new ApiError('NOT_FOUND');
    return info;
  }

  private async active(sessionId: string) {
    const [row] = await this.db
      .select()
      .from(sessionGradingDelegates)
      .where(
        and(
          eq(sessionGradingDelegates.sessionId, sessionId),
          isNull(sessionGradingDelegates.revokedAt),
        ),
      );
    return row ?? null;
  }

  async current(caller: DelegationCaller, sessionId: string) {
    await this.managed(caller, sessionId);
    const row = await this.active(sessionId);
    if (!row) return { delegate: null };
    const profile = (await this.examiners.profiles([row.userId])).get(row.userId);
    return {
      delegate: {
        userId: row.userId,
        fullName: profile?.fullName ?? null,
        code: profile?.code ?? null,
        grantedAt: row.grantedAt,
      },
    };
  }

  /** Gợi ý Người ra đề đủ điều kiện nhận Ủy quyền: không phải chủ, không có trong Danh sách dự thi. */
  async candidates(caller: DelegationCaller, sessionId: string, q: string) {
    const info = await this.managed(caller, sessionId);
    const roster = (await this.sessions.roster(sessionId)).map((entry) => entry.userId);
    const found = await this.examiners.search(q, [info.ownerId, ...roster], CANDIDATES_LIMIT);
    return { items: found };
  }

  async grant(caller: DelegationCaller, sessionId: string, userId: string) {
    const info = await this.managed(caller, sessionId);
    if (userId === info.ownerId)
      throw new ApiError('INVALID_STATE', { reason: 'DELEGATE_IS_OWNER' });
    if (!(await this.examiners.isActiveExaminer(userId))) {
      throw new ApiError('INVALID_STATE', { reason: 'DELEGATE_NOT_EXAMINER' });
    }
    if (await this.sessions.isInRoster(sessionId, userId)) {
      throw new ApiError('INVALID_STATE', { reason: 'DELEGATE_IN_ROSTER' });
    }
    const existing = await this.active(sessionId);
    if (existing?.userId === userId) return this.current(caller, sessionId);
    const now = this.clock.now();
    let replaced: string | null = null;
    try {
      await this.db.transaction(async (tx) => {
        const [current] = await tx
          .update(sessionGradingDelegates)
          .set({ revokedAt: now })
          .where(
            and(
              eq(sessionGradingDelegates.sessionId, sessionId),
              isNull(sessionGradingDelegates.revokedAt),
            ),
          )
          .returning({ userId: sessionGradingDelegates.userId });
        replaced = current?.userId ?? null;
        await tx
          .insert(sessionGradingDelegates)
          .values({ sessionId, userId, grantedBy: caller.actor.id, grantedAt: now });
        await this.audit.record(
          {
            actor: caller.actor,
            action: 'session.grading_delegated',
            entityType: 'session',
            entityId: sessionId,
            before: replaced ? { delegateId: replaced } : null,
            after: { delegateId: userId },
          },
          tx,
        );
        await this.notifications.notify(
          {
            userIds: [userId],
            type: 'session.grading_delegated',
            data: { sessionId, title: info.title },
          },
          tx,
        );
        if (replaced && replaced !== userId) {
          await this.notifications.notify(
            {
              userIds: [replaced],
              type: 'session.grading_delegate_revoked',
              data: { sessionId, title: info.title },
            },
            tx,
          );
        }
      });
    } catch (error) {
      // Hai yêu cầu cấp cùng lúc: chỉ mục duy nhất giữ một người hiệu lực.
      if (pgErrorOf(error)?.code === '23505') throw new ApiError('CONFLICT');
      throw error;
    }
    return this.current(caller, sessionId);
  }

  async revoke(caller: DelegationCaller, sessionId: string) {
    const info = await this.managed(caller, sessionId);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(sessionGradingDelegates)
        .set({ revokedAt: now })
        .where(
          and(
            eq(sessionGradingDelegates.sessionId, sessionId),
            isNull(sessionGradingDelegates.revokedAt),
          ),
        )
        .returning({ userId: sessionGradingDelegates.userId });
      if (!row) return;
      await this.audit.record(
        {
          actor: caller.actor,
          action: 'session.grading_delegate_revoked',
          entityType: 'session',
          entityId: sessionId,
          before: { delegateId: row.userId },
        },
        tx,
      );
      await this.notifications.notify(
        {
          userIds: [row.userId],
          type: 'session.grading_delegate_revoked',
          data: { sessionId, title: info.title },
        },
        tx,
      );
    });
    return { delegate: null };
  }

  /** Các Phiên thi mà người này đang được Ủy quyền chấm. */
  async delegatedTo(userId: string) {
    const rows = await this.db
      .select({ sessionId: sessionGradingDelegates.sessionId })
      .from(sessionGradingDelegates)
      .where(
        and(eq(sessionGradingDelegates.userId, userId), isNull(sessionGradingDelegates.revokedAt)),
      );
    const all = await this.sessions.infoMany(rows.map((row) => row.sessionId));
    // Bỏ Phiên thi mà người này nay có tên trong Danh sách dự thi (Ủy quyền không còn hiệu lực, Q307).
    const infos = [];
    for (const info of all) {
      if (!(await this.sessions.isInRoster(info.sessionId, userId))) infos.push(info);
    }
    const owners = await this.examiners.profiles([...new Set(infos.map((info) => info.ownerId))]);
    return {
      items: infos.map((info) => ({
        sessionId: info.sessionId,
        title: info.title,
        opensAt: info.opensAt,
        closesAt: info.closesAt,
        ownerName: owners.get(info.ownerId)?.fullName ?? null,
      })),
    };
  }

  /** Quản trị viên tìm Phiên thi của mọi chủ theo tên. */
  async searchSessions(q: string) {
    const infos = await this.sessions.search(q, 20);
    const owners = await this.examiners.profiles([...new Set(infos.map((info) => info.ownerId))]);
    return {
      items: infos.map((info) => ({
        sessionId: info.sessionId,
        title: info.title,
        opensAt: info.opensAt,
        cancelledAt: info.cancelledAt,
        ownerName: owners.get(info.ownerId)?.fullName ?? null,
      })),
    };
  }
}
