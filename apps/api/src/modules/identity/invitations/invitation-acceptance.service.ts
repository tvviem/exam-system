import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { ApiError, validationFailed } from '../../../common/api-error';
import { CLOCK, type Clock } from '../../../common/clock';
import { mapUniqueToConflict } from '../../../common/pg-error';
import { type Database, DB, type Transaction as Tx } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { AuthSessionMeta } from '../auth/auth-session-store';
import {
  type academicDegreeEnum,
  type academicTitleEnum,
  examinerProfiles,
  invitations,
  units,
  userRoleTags,
  users,
} from '../identity.schema';
import { hashPassword } from '../password/password-hasher';
import { checkPasswordPolicy } from '../password/password-policy';
import { findActiveUserByEmail } from '../users.repository';
import { InvitationRateLimiter } from './invitation-rate-limiter';
import { invitationStatusOf } from './invitation-status';
import { hashInvitationToken } from './invitation-token';

export interface AcceptInput {
  /** Bắt buộc khi email chưa có tài khoản. */
  password?: string;
  academicDegree?: (typeof academicDegreeEnum.enumValues)[number] | null;
  academicTitle?: (typeof academicTitleEnum.enumValues)[number] | null;
}

/** Lời mời trở thành Người ra đề: phần dành cho người được mời, mở bằng link (PR 1c). */
@Injectable()
export class InvitationAcceptanceService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly rateLimiter: InvitationRateLimiter,
  ) {}

  async preview(token: string, ip: string | null) {
    await this.limit(ip);
    const invitation = await this.findPendingOrThrow(this.db, token);
    const [unit] = await this.db
      .select({ name: units.name })
      .from(units)
      .where(eq(units.id, invitation.unitId));
    const account = await findActiveUserByEmail(this.db, invitation.email);
    return {
      email: invitation.email,
      fullName: invitation.fullName,
      unitName: unit?.name ?? null,
      accountExists: !!account,
    };
  }

  /** `current` là người đang đăng nhập (nếu có). Tạo tài khoản mới thì trả kèm Phiên đăng nhập. */
  async accept(
    token: string,
    input: AcceptInput,
    current: AuthenticatedUser | null,
    meta: AuthSessionMeta,
  ) {
    await this.limit(meta.ip);
    const now = this.clock.now();
    // Đua với việc tạo tài khoản cùng email ở chỗ khác: báo trùng email thay vì lỗi 500.
    const result = await mapUniqueToConflict({ users_email_active_key: 'email' }, () =>
      this.db.transaction(async (tx) => {
        // Khóa dòng: hai người nhận cùng lúc thì người sau thấy Lời mời đã `accepted` và bị từ chối.
        const invitation = await this.findPendingOrThrow(tx, token, true);
        const account = await findActiveUserByEmail(tx, invitation.email);
        const user = account
          ? await this.addExaminerTag(tx, invitation, account, input, current, now)
          : await this.createExaminer(tx, invitation, input, now);
        await tx
          .update(invitations)
          .set({ acceptedAt: now, acceptedUserId: user.id })
          .where(eq(invitations.id, invitation.id));
        await this.audit.record(
          {
            actor: { id: user.id, ip: meta.ip },
            action: 'invitation.accept',
            entityType: 'invitation',
            entityId: invitation.id,
            after: { userId: user.id, createdAccount: !account },
          },
          tx,
        );
        return { user, email: invitation.email, createdAccount: !account };
      }),
    );

    const session = result.createdAccount
      ? await this.auth.startSession(result.user, result.email, meta)
      : null;
    return { createdAccount: result.createdAccount, session };
  }

  private async createExaminer(
    tx: Tx,
    invitation: typeof invitations.$inferSelect,
    input: AcceptInput,
    now: Date,
  ) {
    if (!input.password) {
      throw validationFailed('password', 'required');
    }
    const violations = checkPasswordPolicy(input.password, {
      username: null,
      email: invitation.email,
      code: null,
    });
    if (violations.length > 0) throw new ApiError('PASSWORD_POLICY', { violations });

    const [user] = await tx
      .insert(users)
      .values({
        email: invitation.email,
        fullName: invitation.fullName,
        passwordHash: await hashPassword(input.password),
        mustChangePassword: false,
        createdBy: invitation.invitedBy,
      })
      .returning({ id: users.id, isAdmin: users.isAdmin });
    if (!user) throw new Error('Không tạo được tài khoản Người ra đề');
    await tx.insert(userRoleTags).values({
      userId: user.id,
      tag: 'examiner',
      grantedBy: invitation.invitedBy,
      grantedAt: now,
    });
    await tx.insert(examinerProfiles).values({
      userId: user.id,
      unitId: invitation.unitId,
      academicDegree: input.academicDegree ?? null,
      academicTitle: input.academicTitle ?? null,
    });
    return user;
  }

  /** Email đã có tài khoản: người nhận phải đang đăng nhập đúng tài khoản đó (Q83). */
  private async addExaminerTag(
    tx: Tx,
    invitation: typeof invitations.$inferSelect,
    account: { id: string; isAdmin: boolean },
    input: AcceptInput,
    current: AuthenticatedUser | null,
    now: Date,
  ) {
    if (!current) throw new ApiError('UNAUTHENTICATED');
    if (current.id !== account.id) throw new ApiError('FORBIDDEN');
    if (account.isAdmin) throw new ApiError('INVALID_STATE');

    const granted = await tx
      .insert(userRoleTags)
      .values({
        userId: account.id,
        tag: 'examiner',
        grantedBy: invitation.invitedBy,
        grantedAt: now,
      })
      .onConflictDoNothing()
      .returning({ tag: userRoleTags.tag });
    // Đã là Người ra đề từ trước thì giữ nguyên hồ sơ.
    if (granted.length > 0) {
      const profile = {
        unitId: invitation.unitId,
        academicDegree: input.academicDegree ?? null,
        academicTitle: input.academicTitle ?? null,
      };
      await tx
        .insert(examinerProfiles)
        .values({ userId: account.id, ...profile })
        .onConflictDoUpdate({
          target: examinerProfiles.userId,
          // Hồ sơ giữ lại từ lần làm Người ra đề trước (Q64): chỉ điền các ô còn trống.
          set: {
            unitId: sql`coalesce(${examinerProfiles.unitId}, excluded.unit_id)`,
            academicDegree: sql`coalesce(${examinerProfiles.academicDegree}, excluded.academic_degree)`,
            academicTitle: sql`coalesce(${examinerProfiles.academicTitle}, excluded.academic_title)`,
          },
        });
    }
    return account;
  }

  private async findPendingOrThrow(db: Pick<Database, 'select'>, token: string, lock = false) {
    const query = db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashInvitationToken(token)));
    const [invitation] = await (lock ? query.for('update') : query);
    if (!invitation || invitationStatusOf(invitation, this.clock.now()) !== 'pending') {
      throw new ApiError('INVITATION_UNAVAILABLE');
    }
    return invitation;
  }

  private async limit(ip: string | null) {
    if (!(await this.rateLimiter.allow(ip))) throw new ApiError('RATE_LIMITED');
  }
}
