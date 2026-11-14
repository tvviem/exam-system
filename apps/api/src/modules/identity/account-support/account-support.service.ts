import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../../common/actor';
import { ApiError, validationFailed } from '../../../common/api-error';
import { mapUniqueToConflict } from '../../../common/pg-error';
import {
  SUPPORT_ROSTER_SCOPE,
  type SupportRosterScope,
} from '../../../common/support-roster-scope';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { type Database, DB, type Transaction } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import { type EnqueueMail, MailService } from '../../mail/mail.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuthLinks } from '../auth-links/auth-links.service';
import { accountRequestItems, accountRequests, users } from '../identity.schema';
import { findActiveUserByEmail } from '../users.repository';
import {
  canSupport,
  type SupportDenial,
  type SupportRelation,
  type SupportTarget,
} from './support-policy';
import { SupportRateLimiter } from './support-rate-limiter';

const UNIQUE_FIELDS: Record<string, string> = {
  users_username_active_key: 'username',
  users_email_active_key: 'email',
  users_code_active_key: 'code',
};

interface TargetRow extends SupportTarget {
  id: string;
  email: string | null;
  emailVerified: boolean;
}

/**
 * Hỗ trợ kích hoạt (ADR-0009 Q374, Q377, Q384): khi thư không tới, Quản trị viên (mọi tài khoản) và Người ra đề (chỉ sinh viên
 * Chờ kích hoạt của mình) có ba việc: Gửi lại, Sửa email, tạo Liên kết hỗ trợ. Người thực hiện không bao giờ nhìn thấy mật khẩu;
 * mọi thao tác ghi nhật ký (không có mã). Quyền nằm ở `canSupport` (hàm thuần).
 */
@Injectable()
export class AccountSupportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(SUPPORT_ROSTER_SCOPE) private readonly roster: SupportRosterScope,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly links: AuthLinks,
    private readonly limiter: SupportRateLimiter,
  ) {}

  /** Gửi lại thư kích hoạt (Chờ kích hoạt) hoặc thư xác thực (Hoạt động, email chưa xác thực). */
  async resend(user: AuthenticatedUser, actor: Actor, targetId: string): Promise<void> {
    const target = await this.authorize(user, targetId);
    if (!target.email) throw new ApiError('INVALID_STATE', { reason: 'NO_EMAIL' });
    if (!target.pending && target.emailVerified) {
      throw new ApiError('INVALID_STATE', { reason: 'NOTHING_TO_RESEND' });
    }
    const permit = await this.limiter.tryResend(target.id);
    if (!permit.allowed) {
      throw new ApiError('RATE_LIMITED', { allowedAt: permit.allowedAt.toISOString() });
    }
    const kind = target.pending ? 'activation' : 'email_change';
    try {
      await this.mail.enqueue({
        kind,
        toEmail: target.email,
        lane: user.isAdmin || !target.pending ? 'urgent' : 'bulk',
        userId: target.id,
        requestedBy: actor.id,
      });
    } catch (error) {
      await this.limiter.refundResend(target.id);
      throw error;
    }
    await this.audit.record({
      actor,
      action: 'account-support.resend',
      entityType: 'user',
      entityId: target.id,
      after: { kind },
    });
  }

  /** Sửa email của tài khoản, có lý do. Email mới chưa xác thực; mã gửi tới email cũ chết; thư mới tới email mới. */
  async changeEmail(
    user: AuthenticatedUser,
    actor: Actor,
    targetId: string,
    input: { email: string; reason: string },
  ): Promise<void> {
    const target = await this.authorize(user, targetId);
    if (target.email?.toLowerCase() === input.email.toLowerCase()) {
      throw validationFailed('email', 'same_email');
    }
    const taken = await findActiveUserByEmail(this.db, input.email);
    if (taken && taken.id !== target.id) throw new ApiError('CONFLICT', { field: 'email' });

    const lane = user.isAdmin ? 'urgent' : 'bulk';
    await mapUniqueToConflict(UNIQUE_FIELDS, () =>
      this.db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ email: input.email, emailVerifiedAt: null })
          .where(eq(users.id, target.id));
        // Mã và thư đang chờ gắn với email cũ không được sống tiếp.
        await this.links.revokeActive(target.id, ['activation', 'email_change'], tx);
        await this.mail.cancelPendingForUser(target.id, ['activation', 'email_change'], tx);
        await this.enqueueAfterChange(tx, target, input.email, lane, actor);
        await this.audit.record(
          {
            actor,
            action: 'account-support.email-change',
            entityType: 'user',
            entityId: target.id,
            after: { previousEmail: target.email, newEmail: input.email, reason: input.reason },
          },
          tx,
        );
      }),
    );
    await this.mail.wake();
  }

  private async enqueueAfterChange(
    tx: Transaction,
    target: TargetRow,
    newEmail: string,
    lane: 'urgent' | 'bulk',
    actor: Actor,
  ): Promise<void> {
    const mails: EnqueueMail[] = [
      {
        kind: target.pending ? 'activation' : 'email_change',
        toEmail: newEmail,
        lane: target.pending ? lane : 'urgent',
        userId: target.id,
        requestedBy: actor.id,
      },
    ];
    // Tài khoản Hoạt động: báo cho email cũ (không kèm liên kết) như khi tự đổi email.
    if (!target.pending && target.email) {
      mails.push({
        kind: 'email_changed_notice',
        toEmail: target.email,
        lane: 'urgent',
        userId: target.id,
        requestedBy: actor.id,
        context: { newEmail },
      });
    }
    await this.mail.enqueueIn(tx, mails);
  }

  /** Liên kết hỗ trợ: hiện một lần, hạn 60 phút. Chờ kích hoạt thì để kích hoạt, Hoạt động thì để đặt lại mật khẩu. */
  async createLink(
    user: AuthenticatedUser,
    actor: Actor,
    targetId: string,
    reason: string,
  ): Promise<{ link: string; expiresAt: Date; purpose: 'activation' | 'password_reset' }> {
    const target = await this.authorize(user, targetId);
    if (!(await this.limiter.allowLink(actor.id))) throw new ApiError('RATE_LIMITED');
    const purpose = target.pending ? 'activation' : 'password_reset';
    const { token, expiresAt } = await this.links.issue(target.id, 'support_link', {
      createdBy: actor.id,
      reason,
    });
    await this.audit.record({
      actor,
      action: 'account-support.link',
      entityType: 'user',
      entityId: target.id,
      after: { purpose, reason },
    });
    const path = purpose === 'activation' ? '/activate' : '/reset-password';
    return { link: `${this.env.APP_ORIGINS[0]}${path}#${token}`, expiresAt, purpose };
  }

  /** Tải tài khoản đích, tính quan hệ, hỏi `canSupport`; từ chối bằng lỗi không lộ tài khoản có tồn tại hay không. */
  private async authorize(user: AuthenticatedUser, targetId: string): Promise<TargetRow> {
    const [row] = await this.db
      .select({
        id: users.id,
        isAdmin: users.isAdmin,
        status: users.status,
        removedAt: users.removedAt,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, targetId));
    if (!row) throw new ApiError('NOT_FOUND');
    const target: TargetRow = {
      id: row.id,
      email: row.email,
      emailVerified: row.emailVerifiedAt !== null,
      isAdmin: row.isAdmin,
      removed: row.removedAt !== null,
      locked: row.status === 'locked',
      // Quy tắc trạng thái: chưa có mật khẩu là Chờ kích hoạt.
      pending: row.passwordHash === null,
    };
    const decision = canSupport(
      { id: user.id, isAdmin: user.isAdmin, roleTags: user.roleTags },
      target,
      user.isAdmin
        ? { createdByActor: false, inActiveRosterOfActor: false }
        : await this.relation(user.id, target.id),
    );
    if (!decision.allowed) throw denial(decision.reason);
    return target;
  }

  private async relation(examinerId: string, targetId: string): Promise<SupportRelation> {
    const [created] = await this.db
      .select({ id: accountRequestItems.id })
      .from(accountRequestItems)
      .innerJoin(accountRequests, eq(accountRequests.id, accountRequestItems.requestId))
      .where(
        and(
          eq(accountRequestItems.userId, targetId),
          eq(accountRequestItems.outcome, 'created'),
          eq(accountRequests.requestedBy, examinerId),
        ),
      )
      .limit(1);
    return {
      createdByActor: Boolean(created),
      inActiveRosterOfActor: created
        ? false
        : await this.roster.isInOpenRosterOf(examinerId, targetId),
    };
  }
}

function denial(reason: SupportDenial): ApiError {
  switch (reason) {
    // Không cho dò: tài khoản đã Xóa hoặc không thuộc phạm vi của mình trông như không tồn tại.
    case 'target_removed':
    case 'no_relation':
      return new ApiError('NOT_FOUND');
    case 'target_locked':
      return new ApiError('INVALID_STATE', { reason: 'TARGET_LOCKED' });
    case 'not_pending':
      return new ApiError('INVALID_STATE', { reason: 'NOT_PENDING' });
    case 'target_admin':
    case 'not_allowed_role':
      return new ApiError('FORBIDDEN');
  }
}
