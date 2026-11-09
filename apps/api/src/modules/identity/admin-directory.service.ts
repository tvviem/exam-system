import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { AdminDirectory } from '../../common/admin-directory';
import { type Database, DB } from '../../db/db.module';
import { users } from './identity.schema';

/** Cài đặt cổng `ADMIN_DIRECTORY` (Q366). */
@Injectable()
export class AdminDirectoryService implements AdminDirectory {
  constructor(@Inject(DB) private readonly db: Database) {}

  async activeAdminIds() {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isAdmin, true), eq(users.status, 'active'), isNull(users.removedAt)));
    return rows.map((row) => row.id);
  }
}
