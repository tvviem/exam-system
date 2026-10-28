import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import { type Database, DB } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { AuthSessionStore } from './auth/auth-session-store';
import { LoginBlock } from './auth/login-block';
import { users } from './identity.schema';
import { hashPassword } from './password/password-hasher';
import { checkPasswordPolicy } from './password/password-policy';
import {
  generateTemporaryPassword,
  TEMPORARY_PASSWORD_TTL_MS,
} from './password/temporary-password';

export class AdminAccountError extends Error {}

export interface BootstrapAdminInput {
  username: string;
  email: string | null;
  fullName: string;
  password: string;
}

/** Tạo và khôi phục tài khoản Quản trị viên từ dòng lệnh trên máy chủ. */
@Injectable()
export class AdminAccountsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly authSessions: AuthSessionStore,
    private readonly loginBlock: LoginBlock,
  ) {}

  async bootstrapAdmin(input: BootstrapAdminInput): Promise<{ id: string }> {
    const violations = checkPasswordPolicy(input.password, { ...input, code: null });
    if (violations.length > 0) {
      throw new AdminAccountError(`Mật khẩu khởi tạo vi phạm chính sách: ${violations.join(', ')}`);
    }
    const passwordHash = await hashPassword(input.password);

    return this.db.transaction(async (tx) => {
      // Khóa advisory theo giao dịch: hai lệnh chạy đồng thời không cùng tạo được Quản trị viên.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cli.bootstrap-admin'))`);
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.isAdmin, true), isNull(users.removedAt)))
        .limit(1);
      if (existing)
        throw new AdminAccountError('Đã có Quản trị viên; lệnh bootstrap-admin chỉ chạy một lần.');

      const [created] = await tx
        .insert(users)
        .values({
          username: input.username,
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          isAdmin: true,
          mustChangePassword: true,
        })
        .returning({ id: users.id });
      if (!created) throw new Error('Không tạo được Quản trị viên');
      await this.audit.record(
        { actorId: null, action: 'cli.bootstrap-admin', entityType: 'user', entityId: created.id },
        tx,
      );
      return created;
    });
  }

  /**
   * Khôi phục một tài khoản Quản trị viên chưa bị Xóa: mở Khóa đăng nhập, cấp mật khẩu tạm mới (7 ngày)
   * và thu hồi mọi phiên. Mất hết Quản trị viên vì đều đã bị Xóa thì dùng bootstrap-admin.
   */
  async recoverAdmin(username: string): Promise<{ temporaryPassword: string }> {
    const [user] = await this.db
      .select({ id: users.id, isAdmin: users.isAdmin, status: users.status })
      .from(users)
      .where(and(eq(users.username, username), isNull(users.removedAt)))
      .limit(1);
    if (!user) throw new AdminAccountError(`Không tìm thấy người dùng "${username}".`);
    if (!user.isAdmin) {
      throw new AdminAccountError(
        `"${username}" không phải tài khoản Quản trị viên ; tài khoản Quản trị viên được tách riêng khỏi tài khoản Người ra đề và Người dự thi.`,
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: true,
          passwordExpiresAt: new Date(now.getTime() + TEMPORARY_PASSWORD_TTL_MS),
          failedLoginCount: 0,
          status: 'active',
          lockedAt: null,
          lockedBy: null,
          lockedReason: null,
        })
        .where(eq(users.id, user.id));
      await this.audit.record(
        {
          actorId: null,
          action: 'cli.recover-admin',
          entityType: 'user',
          entityId: user.id,
          before: { status: user.status },
          after: { status: 'active', mustChangePassword: true },
        },
        tx,
      );
    });
    await this.loginBlock.clear(user.id);
    await this.authSessions.revokeAllForUser(user.id, 'admin_recovered');
    return { temporaryPassword };
  }
}
