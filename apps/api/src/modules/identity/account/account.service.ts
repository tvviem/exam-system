import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { Actor } from '../../../common/actor';
import { ApiError } from '../../../common/api-error';
import { type Database, DB } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { examinerProfiles, units, users } from '../identity.schema';

/** Trường Người dùng tự sửa theo vai trò (Q133). Mã, lớp, email, tên đăng nhập, Đơn vị chỉ Quản trị viên sửa. */
const COMMON = ['dateOfBirth', 'gender'] as const;
const EXAMINER_ONLY = ['academicDegree', 'academicTitle'] as const;
export type EditableField = 'fullName' | (typeof COMMON)[number] | (typeof EXAMINER_ONLY)[number];

export function editableFieldsOf(
  user: Pick<AuthenticatedUser, 'isAdmin' | 'roleTags'>,
): EditableField[] {
  if (user.isAdmin) return ['fullName', ...COMMON];
  if (user.roleTags.includes('examiner')) return ['fullName', ...COMMON, ...EXAMINER_ONLY];
  return [...COMMON];
}

export type AccountChanges = Partial<{
  fullName: string;
  dateOfBirth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  academicDegree: (typeof examinerProfiles.academicDegree.enumValues)[number] | null;
  academicTitle: (typeof examinerProfiles.academicTitle.enumValues)[number] | null;
}>;

/** Thông tin tài khoản của chính người đăng nhập (Q132–Q136). */
@Injectable()
export class AccountService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async get(user: AuthenticatedUser) {
    const [row] = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        username: users.username,
        email: users.email,
        emailVerified: sql<boolean>`${users.emailVerifiedAt} IS NOT NULL`,
        code: users.code,
        classLabel: users.classLabel,
        dateOfBirth: users.dateOfBirth,
        gender: users.gender,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .where(eq(users.id, user.id));
    if (!row) throw new ApiError('NOT_FOUND');
    const [profile] = await this.db
      .select({
        academicDegree: examinerProfiles.academicDegree,
        academicTitle: examinerProfiles.academicTitle,
        unitName: units.name,
      })
      .from(examinerProfiles)
      .leftJoin(units, eq(units.id, examinerProfiles.unitId))
      .where(eq(examinerProfiles.userId, user.id));
    return {
      ...row,
      roleTags: user.roleTags,
      examinerProfile: user.roleTags.includes('examiner') && profile ? profile : null,
      editable: editableFieldsOf(user),
    };
  }

  async update(user: AuthenticatedUser, actor: Actor, changes: AccountChanges) {
    const before = await this.get(user);
    const current: Record<string, unknown> = {
      fullName: before.fullName,
      dateOfBirth: before.dateOfBirth,
      gender: before.gender,
      academicDegree: before.examinerProfile?.academicDegree ?? null,
      academicTitle: before.examinerProfile?.academicTitle ?? null,
    };
    const changed = (Object.entries(changes) as [EditableField, unknown][]).filter(
      ([field, value]) => current[field] !== value,
    );
    if (changed.length === 0) return this.get(user);

    const userPart = Object.fromEntries(
      changed.filter(([f]) => f === 'fullName' || f === 'dateOfBirth' || f === 'gender'),
    );
    const profilePart = Object.fromEntries(
      changed.filter(([f]) => f === 'academicDegree' || f === 'academicTitle'),
    );
    await this.db.transaction(async (tx) => {
      if (Object.keys(userPart).length > 0) {
        await tx.update(users).set(userPart).where(eq(users.id, user.id));
      }
      if (Object.keys(profilePart).length > 0) {
        await tx
          .insert(examinerProfiles)
          .values({ userId: user.id, ...profilePart })
          .onConflictDoUpdate({ target: examinerProfiles.userId, set: profilePart });
      }
      await this.audit.record(
        {
          actor,
          action: 'account.update',
          entityType: 'user',
          entityId: user.id,
          before: Object.fromEntries(changed.map(([f]) => [f, current[f]])),
          after: Object.fromEntries(changed),
        },
        tx,
      );
    });
    return this.get(user);
  }
}
