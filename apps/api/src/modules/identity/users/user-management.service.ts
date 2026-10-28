import { Inject, Injectable } from '@nestjs/common';
import { asc, count, desc, inArray } from 'drizzle-orm';
import { type Database, DB } from '../../../db/db.module';
import type { RoleTag } from '../auth/auth.types';
import { userRoleTags, users } from '../identity.schema';

export interface Page {
  page: number;
  pageSize: number;
}

export type UserStatus = 'active' | 'locked' | 'removed';

/** Quản lý Người dùng của Quản trị viên (PR 1b). */
@Injectable()
export class UserManagementService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list({ page, pageSize }: Page) {
    const [totalRow] = await this.db.select({ total: count() }).from(users);
    const rows = await this.db
      .select()
      .from(users)
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
