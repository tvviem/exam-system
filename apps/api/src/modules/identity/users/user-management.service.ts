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
import type { Page } from '../../../common/pagination';
import { uniqueViolationOf } from '../../../common/pg-error';
import { type Database, DB } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import type { RoleTag } from '../auth/auth.types';
import { examinerProfiles, units, userRoleTags, users } from '../identity.schema';
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
    private readonly audit: AuditService,
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
