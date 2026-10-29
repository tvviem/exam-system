import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { CLOCK, type Clock } from '../../common/clock';
import { type Page, paginate } from '../../common/pagination';
import { type Database, DB } from '../../db/db.module';
import { auditLogs } from './audit.schema';

export interface AuditEntry {
  /** null: thao tác do hệ thống (CLI, worker). */
  actor: Actor | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface AuditFilter {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async record(entry: AuditEntry, tx: Pick<Database, 'insert'> = this.db): Promise<void> {
    await tx.insert(auditLogs).values({
      actorId: entry.actor?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.actor?.ip ?? null,
      at: this.clock.now(),
    });
  }

  /** Nhật ký thao tác, mới nhất trước (Q67). Tên người thực hiện do module sở hữu Người dùng gắn thêm. */
  list({ page, pageSize, ...filter }: Page & AuditFilter) {
    const conditions: SQL[] = [];
    if (filter.actorId) conditions.push(eq(auditLogs.actorId, filter.actorId));
    if (filter.action) conditions.push(eq(auditLogs.action, filter.action));
    if (filter.entityType) conditions.push(eq(auditLogs.entityType, filter.entityType));
    if (filter.entityId) conditions.push(eq(auditLogs.entityId, filter.entityId));
    const where = and(...conditions);
    return paginate(
      { page, pageSize },
      () => this.db.select({ total: count() }).from(auditLogs).where(where),
      (limit, offset) =>
        this.db
          .select()
          .from(auditLogs)
          .where(where)
          .orderBy(desc(auditLogs.at), desc(auditLogs.id))
          .limit(limit)
          .offset(offset),
    );
  }
}
