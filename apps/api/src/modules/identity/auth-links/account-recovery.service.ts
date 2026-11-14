import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { MailService } from '../../mail/mail.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { userRoleTags, users } from '../identity.schema';
import {
  AuthLinks,
  type ConsumeResult,
  type LinkClient,
  type LinkPurpose,
  type LinkStatus,
} from './auth-links.service';
import { describeClient } from './describe-client';
import { RecoveryRateLimiter } from './recovery-rate-limiter';

/** Thư kích hoạt gửi lại cho cùng một người tối đa một lần mỗi 24 giờ (Q375). */
const ACTIVATION_COOLDOWN_MS = 24 * 3_600_000;

/**
 * Luồng người dùng tự phục vụ (ADR-0009): quên mật khẩu, xem và dùng Liên kết một lần. Câu trả lời với người gọi KHÔNG
 * bao giờ cho biết tài khoản có tồn tại hay không; ai nhận thư là quyết định ở trong này.
 */
@Injectable()
export class AccountRecoveryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: AuthLinks,
    private readonly mail: MailService,
    private readonly limiter: RecoveryRateLimiter,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Xếp thư đặt lại (hoặc kích hoạt) nếu đủ điều kiện; im lặng nếu không. Người gọi luôn nhận cùng một câu trả lời. */
  async requestReset(identifier: string, ip: string | null): Promise<void> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        status: users.status,
        passwordHash: users.passwordHash,
        activatedAt: users.activatedAt,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(
        and(
          isNull(users.removedAt),
          or(eq(users.username, identifier), eq(users.email, identifier)),
        ),
      )
      .limit(1);
    // Giới hạn theo người đã tra ra (tên đăng nhập hay email đều là một người), không theo chuỗi gõ.
    if (!(await this.limiter.allow(user?.id ?? identifier.toLowerCase(), ip))) return;
    if (!user?.email || user.status === 'locked') return;

    if (!user.activatedAt && !user.passwordHash) {
      // Chờ kích hoạt: nhận lại thư kích hoạt, chịu giới hạn gửi lại.
      if (!(await this.limiter.allowAnonymousMail())) return;
      await this.mail.enqueueWithCooldown(
        { kind: 'activation', toEmail: user.email, lane: 'bulk', userId: user.id },
        { cooldownMs: ACTIVATION_COOLDOWN_MS },
      );
      return;
    }
    // Email chưa xác thực thì không nhận thư đặt lại (chưa chứng minh được hộp thư là của chính chủ).
    if (!user.emailVerifiedAt) return;
    if (!(await this.limiter.allowAnonymousMail())) return;
    await this.mail.enqueue({
      kind: 'password_reset',
      toEmail: user.email,
      lane: 'urgent',
      userId: user.id,
    });
  }

  status(token: string, purpose: LinkPurpose): Promise<LinkStatus> {
    return this.links.status(token, purpose);
  }

  /** Bấm liên kết đổi email; đổi xong báo tới email CŨ (không liên kết, địa chỉ mới che bớt). Không trả email cũ cho người gọi. */
  async confirmEmail(
    token: string,
    client: LinkClient,
  ): Promise<
    Exclude<Awaited<ReturnType<AuthLinks['confirmEmail']>>, { state: 'ok' }> | { state: 'ok' }
  > {
    const result = await this.links.confirmEmail(token, client);
    if (result.state !== 'ok') return result;
    if (
      result.previousEmail &&
      result.previousEmail.toLowerCase() !== result.newEmail.toLowerCase()
    ) {
      await this.mail.enqueue({
        kind: 'email_changed_notice',
        toEmail: result.previousEmail,
        lane: 'urgent',
        userId: result.userId,
        context: { newEmail: result.newEmail },
      });
    }
    return { state: 'ok' };
  }

  /** Dùng liên kết đặt mật khẩu; đặt lại xong thì báo cho chủ tài khoản bằng một thư (không kèm mật khẩu). */
  async complete(
    token: string,
    purpose: LinkPurpose,
    newPassword: string,
    client: LinkClient,
  ): Promise<ConsumeResult> {
    const result = await this.links.consume(token, purpose, newPassword, client);
    if (result.state === 'ok' && purpose === 'password_reset') {
      const owner = await this.links.ownerOf(token);
      if (owner) await this.notifyAdminsIfPrivileged(owner.id);
      if (owner?.email) {
        const { browser, os } = describeClient(client.userAgent);
        await this.mail.enqueue({
          kind: 'password_changed',
          toEmail: owner.email,
          lane: 'urgent',
          userId: owner.id,
          context: {
            changedAt: this.clock.now().toISOString(),
            ...(browser ? { browser } : {}),
            ...(os ? { os } : {}),
          },
        });
      }
    }
    return result;
  }

  /**
   * Mật khẩu của Người ra đề hoặc Quản trị viên vừa được đặt lại (qua email hay Liên kết hỗ trợ): chuông cho các Quản trị viên KHÁC
   * (Q377), để phát hiện nếu có người chiếm hộp thư. Người dự thi đặt lại thì không báo (quá nhiều, ít rủi ro).
   */
  private async notifyAdminsIfPrivileged(ownerId: string): Promise<void> {
    const [owner] = await this.db
      .select({
        fullName: users.fullName,
        isAdmin: users.isAdmin,
        examiner: sql<boolean>`EXISTS (SELECT 1 FROM ${userRoleTags} WHERE ${userRoleTags.userId} = ${users.id} AND ${userRoleTags.tag} = 'examiner')`,
      })
      .from(users)
      .where(eq(users.id, ownerId));
    if (!owner || !(owner.isAdmin || owner.examiner)) return;
    const admins = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isAdmin, true), isNull(users.removedAt), eq(users.status, 'active')));
    await this.notifications.notify({
      userIds: admins.map((a) => a.id).filter((id) => id !== ownerId),
      type: 'account.password_reset_by_email',
      data: { userId: ownerId, name: owner.fullName },
    });
  }
}
