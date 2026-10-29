import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { type Database, DB } from '../../db/db.module';
import type { AuthenticatedUser } from './auth/auth.types';
import { userRoleTags, users } from './identity.schema';

export type UserRow = typeof users.$inferSelect;

/** Tài khoản chưa bị Xóa có email này (citext: không phân biệt hoa thường). */
export async function findActiveUserByEmail(db: Pick<Database, 'select'>, email: string) {
  const [account] = await db
    .select({ id: users.id, isAdmin: users.isAdmin })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.removedAt)));
  return account;
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Tìm Người dùng chưa bị Xóa theo tên đăng nhập hoặc email (citext: không phân biệt hoa thường). */
  async findActiveByIdentifier(identifier: string): Promise<UserRow | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(
        and(
          isNull(users.removedAt),
          or(eq(users.username, identifier), eq(users.email, identifier)),
        ),
      )
      .limit(1);
    return row;
  }

  async findById(id: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  /** Họ tên theo id, kể cả người đã bị Xóa (để hiển thị lịch sử). */
  async fullNamesOf(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, [...new Set(ids)]));
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  async toAuthenticated(user: UserRow): Promise<AuthenticatedUser> {
    const roleTags = await this.db
      .select({ tag: userRoleTags.tag })
      .from(userRoleTags)
      .where(eq(userRoleTags.userId, user.id))
      .orderBy(userRoleTags.tag);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      code: user.code,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      roleTags: roleTags.map((t) => t.tag),
      mustChangePassword: user.mustChangePassword,
    };
  }
}
