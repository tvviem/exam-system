import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { ApiError } from '../../../common/api-error';
import { CLOCK, type Clock } from '../../../common/clock';
import type { Page } from '../../../common/pagination';
import { uniqueViolationOf } from '../../../common/pg-error';
import { type Database, DB } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import type { RoleTag } from '../auth/auth.types';
import { AuthSessionStore } from '../auth/auth-session-store';
import { LoginBlock } from '../auth/login-block';
import { examinerProfiles, units, userRoleTags, users } from '../identity.schema';
import { hashPassword } from '../password/password-hasher';
import {
  generateTemporaryPassword,
  TEMPORARY_PASSWORD_TTL_MS,
} from '../password/temporary-password';
import type { UserRow } from '../users.repository';

export type UserStatus = 'active' | 'locked' | 'removed';

export interface UserFilter {
  q?: string;
  status?: UserStatus;
  roleTag?: RoleTag;
}

type ExaminerProfileRow = typeof examinerProfiles.$inferSelect;

export interface UserUpdate {
  fullName?: string;
  username?: string | null;
  email?: string | null;
  code?: string | null;
  classLabel?: string | null;
  dateOfBirth?: string | null;
  gender?: UserRow['gender'];
  examinerProfile?: Partial<
    Pick<ExaminerProfileRow, 'academicDegree' | 'academicTitle' | 'unitId'>
  >;
}

/** Người thực hiện thao tác quản trị, để ghi nhật ký. */
export interface Actor {
  id: string;
  ip: string | null;
}

// Q65: tài khoản Quản trị viên chỉ có thông tin đăng nhập và họ tên.
const ADMIN_EDITABLE = new Set<keyof UserUpdate>(['fullName', 'username', 'email']);

const UNIQUE_FIELDS: Record<string, string> = {
  users_username_active_key: 'username',
  users_email_active_key: 'email',
  users_code_active_key: 'code',
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

const validationFailed = (path: string, code: string) =>
  new ApiError('VALIDATION_FAILED', { issues: [{ path, code }] });

/** Quản lý Người dùng của Quản trị viên (PR 1b). */
@Injectable()
export class UserManagementService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly authSessions: AuthSessionStore,
    private readonly loginBlock: LoginBlock,
  ) {}

  async list({ page, pageSize, ...filter }: Page & UserFilter) {
    const where = this.whereOf(filter);
    const [totalRow] = await this.db.select({ total: count() }).from(users).where(where);
    const rows = await this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const tags = await this.roleTagsOf(rows.map((r) => r.id));
    return {
      total: totalRow?.total ?? 0,
      page,
      pageSize,
      items: rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        username: r.username,
        email: r.email,
        code: r.code,
        classLabel: r.classLabel,
        isAdmin: r.isAdmin,
        roleTags: tags.get(r.id) ?? [],
        status: statusOf(r),
        lastLoginAt: r.lastLoginAt,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Chi tiết một Người dùng; ngày sinh và giới tính chỉ trả cho Quản trị viên (Nghị định 13/2023). */
  async detail(id: string) {
    const user = await this.findOrThrow(id);
    const roleTags = (await this.roleTagsOf([id])).get(id) ?? [];
    const [profile] = await this.db
      .select({
        academicDegree: examinerProfiles.academicDegree,
        academicTitle: examinerProfiles.academicTitle,
        unitId: examinerProfiles.unitId,
        unitName: units.name,
      })
      .from(examinerProfiles)
      .leftJoin(units, eq(units.id, examinerProfiles.unitId))
      .where(eq(examinerProfiles.userId, id));
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      code: user.code,
      classLabel: user.classLabel,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      isAdmin: user.isAdmin,
      roleTags,
      status: statusOf(user),
      lockedAt: user.lockedAt,
      lockedReason: user.lockedReason,
      removedAt: user.removedAt,
      mustChangePassword: user.mustChangePassword,
      passwordExpiresAt: user.passwordExpiresAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      examinerProfile: profile ?? null,
    };
  }

  async update(actor: Actor, id: string, input: UserUpdate): Promise<void> {
    const user = await this.findOrThrow(id);
    if (user.removedAt) throw new ApiError('INVALID_STATE');
    if (user.isAdmin) {
      const notAllowed = (Object.keys(input) as (keyof UserUpdate)[]).find(
        (k) => !ADMIN_EDITABLE.has(k),
      );
      if (notAllowed) throw validationFailed(notAllowed, 'not_allowed_for_admin');
    }
    const username = input.username === undefined ? user.username : input.username;
    const email = input.email === undefined ? user.email : input.email;
    if (!username && !email) throw validationFailed('username', 'username_or_email_required');

    const { examinerProfile, ...fields } = input;
    if (examinerProfile) await this.assertCanHaveExaminerProfile(id, examinerProfile.unitId);

    // Q68: nhật ký chỉ ghi các trường thật sự thay đổi.
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields) as [keyof typeof fields, unknown][]) {
      if (user[key] !== value) {
        before[key] = user[key];
        after[key] = value;
      }
    }
    if (examinerProfile) {
      const old = await this.profileOf(id);
      for (const [key, value] of Object.entries(examinerProfile) as [
        keyof typeof examinerProfile,
        unknown,
      ][]) {
        if ((old?.[key] ?? null) !== value) {
          before[`examinerProfile.${key}`] = old?.[key] ?? null;
          after[`examinerProfile.${key}`] = value;
        }
      }
    }
    if (Object.keys(after).length === 0) return;

    try {
      await this.db.transaction(async (tx) => {
        if (Object.keys(fields).length > 0) {
          await tx.update(users).set(fields).where(eq(users.id, id));
        }
        if (examinerProfile) {
          await tx
            .insert(examinerProfiles)
            .values({ userId: id, ...examinerProfile })
            .onConflictDoUpdate({ target: examinerProfiles.userId, set: examinerProfile });
        }
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'user.update',
            entityType: 'user',
            entityId: id,
            before,
            after,
            ip: actor.ip,
          },
          tx,
        );
      });
    } catch (error) {
      const field = UNIQUE_FIELDS[uniqueViolationOf(error) ?? ''];
      if (field) throw new ApiError('CONFLICT', { field });
      throw error;
    }
  }

  /** Khóa đăng nhập: bắt buộc lý do, thu hồi mọi Phiên đăng nhập. */
  async lock(actor: Actor, id: string, reason: string): Promise<void> {
    const user = await this.findTargetOrThrow(actor, id);
    if (user.status === 'locked') throw new ApiError('INVALID_STATE');
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: 'locked',
          lockedAt: this.clock.now(),
          lockedBy: actor.id,
          lockedReason: reason,
        })
        .where(eq(users.id, id));
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.lock',
          entityType: 'user',
          entityId: id,
          before: { status: 'active' },
          after: { status: 'locked', reason },
          ip: actor.ip,
        },
        tx,
      );
    });
    await this.authSessions.revokeAllForUser(id, 'user_locked');
  }

  /** Mở Khóa đăng nhập; lý do không bắt buộc (Q63). */
  async unlock(actor: Actor, id: string, reason: string | null): Promise<void> {
    const user = await this.findTargetOrThrow(actor, id);
    if (user.status !== 'locked') throw new ApiError('INVALID_STATE');
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: 'active', lockedAt: null, lockedBy: null, lockedReason: null })
        .where(eq(users.id, id));
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.unlock',
          entityType: 'user',
          entityId: id,
          before: { status: 'locked', reason: user.lockedReason },
          after: { status: 'active', ...(reason ? { reason } : {}) },
          ip: actor.ip,
        },
        tx,
      );
    });
  }

  /**
   * Xóa người dùng (soft-delete), thu hồi mọi Phiên đăng nhập. Ở lát cắt 1 Người ra đề chưa sở hữu
   * Chủ đề, Bộ đề hay Phiên thi nên xóa thẳng; việc chọn người nhận làm ở lát cắt 2–4.
   */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.findTargetOrThrow(actor, id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ removedAt: this.clock.now(), removedBy: actor.id })
        .where(eq(users.id, id));
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.remove',
          entityType: 'user',
          entityId: id,
          ip: actor.ip,
        },
        tx,
      );
    });
    await this.authSessions.revokeAllForUser(id, 'user_removed');
  }

  /** Gắn Nhãn vai trò; gắn `examiner` thì tạo hồ sơ Người ra đề trống nếu chưa có (Q64). */
  async grantRoleTag(actor: Actor, id: string, tag: RoleTag): Promise<void> {
    const user = await this.findTaggableOrThrow(id);
    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(userRoleTags)
        .values({ userId: user.id, tag, grantedBy: actor.id, grantedAt: this.clock.now() })
        .onConflictDoNothing()
        .returning({ tag: userRoleTags.tag });
      if (inserted.length === 0) return;
      if (tag === 'examiner') {
        await tx.insert(examinerProfiles).values({ userId: user.id }).onConflictDoNothing();
      }
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.role-tag.grant',
          entityType: 'user',
          entityId: id,
          after: { tag },
          ip: actor.ip,
        },
        tx,
      );
    });
  }

  /** Gỡ Nhãn vai trò; hồ sơ Người ra đề được giữ lại (Q64). */
  async revokeRoleTag(actor: Actor, id: string, tag: RoleTag): Promise<void> {
    await this.findTaggableOrThrow(id);
    await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(userRoleTags)
        .where(and(eq(userRoleTags.userId, id), eq(userRoleTags.tag, tag)))
        .returning({ tag: userRoleTags.tag });
      if (deleted.length === 0) return;
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.role-tag.revoke',
          entityType: 'user',
          entityId: id,
          before: { tag },
          ip: actor.ip,
        },
        tx,
      );
    });
  }

  /**
   * Cấp lại mật khẩu tạm (Q61): hạn 7 ngày, buộc đổi khi đăng nhập, thu hồi mọi phiên và gỡ khóa tạm.
   * Không mở Khóa đăng nhập. Mật khẩu chỉ trả về một lần, không ghi vào DB hay nhật ký.
   */
  async reissueTemporaryPassword(actor: Actor, id: string) {
    await this.findTargetOrThrow(actor, id);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const passwordExpiresAt = new Date(this.clock.now().getTime() + TEMPORARY_PASSWORD_TTL_MS);
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: true, passwordExpiresAt })
        .where(eq(users.id, id));
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'user.temporary-password.reissue',
          entityType: 'user',
          entityId: id,
          after: { passwordExpiresAt },
          ip: actor.ip,
        },
        tx,
      );
    });
    await this.loginBlock.clear(id);
    await this.authSessions.revokeAllForUser(id, 'password_reissued');
    return { temporaryPassword, passwordExpiresAt };
  }

  /** Chỉ định Quản trị viên = tạo tài khoản Quản trị viên riêng, không mang Nhãn vai trò (Q23, Q70). */
  async createAdmin(
    actor: Actor,
    input: { username: string; email: string | null; fullName: string },
  ) {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const passwordExpiresAt = new Date(this.clock.now().getTime() + TEMPORARY_PASSWORD_TTL_MS);
    try {
      const created = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(users)
          .values({
            ...input,
            passwordHash,
            isAdmin: true,
            mustChangePassword: true,
            passwordExpiresAt,
            createdBy: actor.id,
          })
          .returning({ id: users.id });
        if (!row) throw new Error('Không tạo được Quản trị viên');
        await this.audit.record(
          {
            actorId: actor.id,
            action: 'admin.create',
            entityType: 'user',
            entityId: row.id,
            after: input,
            ip: actor.ip,
          },
          tx,
        );
        return row;
      });
      return { id: created.id, temporaryPassword, passwordExpiresAt };
    } catch (error) {
      const field = UNIQUE_FIELDS[uniqueViolationOf(error) ?? ''];
      if (field) throw new ApiError('CONFLICT', { field });
      throw error;
    }
  }

  /** Người dùng chưa bị Xóa và không phải Quản trị viên. */
  private async findTaggableOrThrow(id: string): Promise<UserRow> {
    const user = await this.findOrThrow(id);
    if (user.removedAt || user.isAdmin) throw new ApiError('INVALID_STATE');
    return user;
  }

  /** Người dùng chưa bị Xóa và không phải chính người thực hiện. */
  private async findTargetOrThrow(actor: Actor, id: string): Promise<UserRow> {
    if (actor.id === id) throw new ApiError('CANNOT_TARGET_SELF');
    const user = await this.findOrThrow(id);
    if (user.removedAt) throw new ApiError('INVALID_STATE');
    return user;
  }

  private async assertCanHaveExaminerProfile(userId: string, unitId: string | null | undefined) {
    const tags = (await this.roleTagsOf([userId])).get(userId) ?? [];
    if (!tags.includes('examiner')) {
      throw validationFailed('examinerProfile', 'requires_examiner_tag');
    }
    if (unitId) {
      const [unit] = await this.db.select({ id: units.id }).from(units).where(eq(units.id, unitId));
      if (!unit) throw validationFailed('examinerProfile.unitId', 'unit_not_found');
    }
  }

  private async profileOf(userId: string): Promise<ExaminerProfileRow | undefined> {
    const [row] = await this.db
      .select()
      .from(examinerProfiles)
      .where(eq(examinerProfiles.userId, userId));
    return row;
  }

  private async findOrThrow(id: string): Promise<UserRow> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    if (!user) throw new ApiError('NOT_FOUND');
    return user;
  }

  /** Mặc định ẩn người đã bị Xóa (Q66). Từ khóa so khớp không dấu, không phân biệt hoa thường (Q69). */
  private whereOf({ q, status, roleTag }: UserFilter): SQL | undefined {
    const conditions: (SQL | undefined)[] = [
      status === 'removed' ? isNotNull(users.removedAt) : isNull(users.removedAt),
    ];
    if (status === 'active' || status === 'locked') conditions.push(eq(users.status, status));
    if (roleTag) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(userRoleTags)
            .where(and(eq(userRoleTags.userId, users.id), eq(userRoleTags.tag, roleTag))),
        ),
      );
    }
    if (q) {
      const pattern = `%${escapeLike(q)}%`;
      conditions.push(
        or(
          ...[users.fullName, users.username, users.email, users.code, users.classLabel].map(
            (column) => sql`unaccent(coalesce(${column}::text, '')) ILIKE unaccent(${pattern})`,
          ),
        ),
      );
    }
    return and(...conditions);
  }

  private async roleTagsOf(userIds: string[]): Promise<Map<string, RoleTag[]>> {
    const result = new Map<string, RoleTag[]>();
    if (userIds.length === 0) return result;
    const rows = await this.db
      .select()
      .from(userRoleTags)
      .where(inArray(userRoleTags.userId, userIds))
      .orderBy(asc(userRoleTags.tag));
    for (const row of rows) result.set(row.userId, [...(result.get(row.userId) ?? []), row.tag]);
    return result;
  }
}

export const statusOf = (user: {
  removedAt: Date | null;
  status: 'active' | 'locked';
}): UserStatus => (user.removedAt ? 'removed' : user.status);
