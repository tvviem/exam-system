import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import { AuthSessionStore } from '../auth/auth-session-store';
import { authTokens, users } from '../identity.schema';
import { hashPassword } from '../password/password-hasher';
import {
  checkPasswordPolicy,
  type PasswordOwner,
  type PasswordPolicyViolation,
} from '../password/password-policy';

export type LinkPurpose = 'activation' | 'password_reset' | 'email_change' | 'support_link';

export type LinkProblem =
  | { state: 'unknown' }
  | { state: 'expired'; expiredAt: Date }
  | { state: 'used'; usedAt: Date }
  | { state: 'replaced' }
  | { state: 'blocked' };
export type LinkStatus = { state: 'ok'; expiresAt: Date } | LinkProblem;
export type ConsumeResult =
  | { state: 'ok' }
  | LinkProblem
  | { state: 'policy'; violations: PasswordPolicyViolation[] };

/** Người dùng tự bấm liên kết nên không có phiên đăng nhập: nhật ký ghi IP và trình duyệt của yêu cầu. */
export interface LinkClient {
  ip: string | null;
  userAgent: string | null;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Hạn từng loại (Q381): kích hoạt 7 ngày, đặt lại 60 phút, đổi email 24 giờ, liên kết hỗ trợ 60 phút. */
const TTL_MS: Record<LinkPurpose, number> = {
  activation: 7 * DAY,
  password_reset: 60 * MINUTE,
  email_change: DAY,
  support_link: 60 * MINUTE,
};

interface LinkOwner extends PasswordOwner {
  activatedAt: Date | null;
  hasPassword: boolean;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Liên kết một lần (ADR-0009): `issue` sinh mã, `consume` dùng mã đặt mật khẩu. Mọi chi tiết (băm, hạn, một lần dùng,
 * vô hiệu mã cũ, thu hồi phiên, nhật ký) nằm bên trong; người gọi chỉ nhận kết quả có kiểu.
 */
@Injectable()
export class AuthLinks {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly sessions: AuthSessionStore,
  ) {}

  /** Phát hành mã mới và vô hiệu mã cũ cùng loại của người đó (mỗi loại chỉ một mã còn hiệu lực). */
  async issue(userId: string, purpose: LinkPurpose): Promise<{ token: string; expiresAt: Date }> {
    const now = this.clock.now();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + TTL_MS[purpose]);
    await this.db.transaction(async (tx) => {
      await tx
        .update(authTokens)
        .set({ replacedAt: now })
        .where(
          and(
            eq(authTokens.userId, userId),
            eq(authTokens.purpose, purpose),
            isNull(authTokens.usedAt),
            isNull(authTokens.replacedAt),
          ),
        );
      await tx
        .insert(authTokens)
        .values({ userId, purpose, tokenHash: hashToken(token), expiresAt, createdAt: now });
    });
    return { token, expiresAt };
  }

  /** Xem mã còn dùng được không mà không tiêu mã (trang hiển thị trước khi người dùng gõ mật khẩu). */
  async status(token: string, purpose: LinkPurpose): Promise<LinkStatus> {
    const found = await this.evaluate(token, purpose);
    return 'problem' in found ? found.problem : { state: 'ok', expiresAt: found.link.expiresAt };
  }

  async consume(
    token: string,
    purpose: LinkPurpose,
    newPassword: string,
    client: LinkClient,
  ): Promise<ConsumeResult> {
    const found = await this.evaluate(token, purpose);
    if ('problem' in found) return found.problem;
    const { link, owner } = found;

    // Vi phạm chính sách thì từ chối mà KHÔNG tiêu mã: người dùng gõ lại được.
    const violations = checkPasswordPolicy(newPassword, owner);
    if (violations.length > 0) return { state: 'policy', violations };

    const now = this.clock.now();
    const passwordHash = await hashPassword(newPassword);
    const claimed = await this.db.transaction(async (tx) => {
      // Nhận mã bằng một câu lệnh có điều kiện: hai lần dùng đồng thời thì chỉ một lần nhận được.
      const [taken] = await tx
        .update(authTokens)
        .set({ usedAt: now })
        .where(
          and(eq(authTokens.id, link.id), isNull(authTokens.usedAt), isNull(authTokens.replacedAt)),
        )
        .returning({ id: authTokens.id });
      if (!taken) return false;
      await tx
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: false,
          passwordExpiresAt: null,
          activatedAt: owner.activatedAt ?? now,
          emailVerifiedAt: now,
        })
        .where(eq(users.id, link.userId));
      // Chỉ ghi việc đã làm, IP và trình duyệt; tuyệt đối không ghi mật khẩu hay mã.
      await this.audit.record(
        {
          actor: { id: link.userId, ip: client.ip },
          // Quy tắc trạng thái: chưa có mật khẩu là Chờ kích hoạt (không dựa vào `activated_at`, có thể rỗng ở dữ liệu cũ).
          action: owner.hasPassword ? 'account.password-reset' : 'account.activated',
          entityType: 'user',
          entityId: link.userId,
          after: { userAgent: client.userAgent },
        },
        tx,
      );
      return true;
    });
    if (!claimed) {
      const [latest] = await this.db
        .select({ usedAt: authTokens.usedAt })
        .from(authTokens)
        .where(eq(authTokens.id, link.id));
      return latest?.usedAt ? { state: 'used', usedAt: latest.usedAt } : { state: 'replaced' };
    }
    await this.sessions.revokeAllForUser(link.userId, 'password_reset');
    return { state: 'ok' };
  }

  /** Chủ của mã (không kiểm trạng thái), để gửi thư báo sau khi dùng xong. */
  async ownerOf(token: string): Promise<{ id: string; email: string | null } | null> {
    const [row] = await this.db
      .select({ id: users.id, email: users.email })
      .from(authTokens)
      .innerJoin(users, eq(users.id, authTokens.userId))
      .where(eq(authTokens.tokenHash, hashToken(token)));
    return row ?? null;
  }

  /**
   * Thứ tự kiểm: mã lạ hoặc sai loại (không nêu chi tiết), đã dùng, bị thay, hết hạn, tài khoản bị chặn.
   * Còn hạn tới trước `expires_at`, hết hạn từ đúng lúc đó.
   */
  private async evaluate(
    token: string,
    purpose: LinkPurpose,
  ): Promise<
    { link: typeof authTokens.$inferSelect; owner: LinkOwner } | { problem: LinkProblem }
  > {
    const [row] = await this.db
      .select({
        link: authTokens,
        status: users.status,
        removedAt: users.removedAt,
        activatedAt: users.activatedAt,
        username: users.username,
        email: users.email,
        code: users.code,
        hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
      })
      .from(authTokens)
      .innerJoin(users, eq(users.id, authTokens.userId))
      .where(eq(authTokens.tokenHash, hashToken(token)));
    if (!row || row.link.purpose !== purpose) return { problem: { state: 'unknown' } };
    const { link } = row;
    if (link.usedAt) return { problem: { state: 'used', usedAt: link.usedAt } };
    if (link.replacedAt) return { problem: { state: 'replaced' } };
    if (this.clock.now().getTime() >= link.expiresAt.getTime()) {
      return { problem: { state: 'expired', expiredAt: link.expiresAt } };
    }
    if (row.removedAt || row.status === 'locked') return { problem: { state: 'blocked' } };
    return {
      link,
      owner: {
        username: row.username,
        email: row.email,
        code: row.code,
        activatedAt: row.activatedAt,
        hasPassword: row.hasPassword,
      },
    };
  }
}
