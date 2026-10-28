import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import type { Page } from '../../common/pagination';
import { type Database, DB } from '../../db/db.module';
import { users } from '../identity/identity.schema';
import { auditLogs } from './audit.schema';

export interface AuditEntry {
  /** null: thao tác do hệ thống (CLI, worker). */
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
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
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
      at: this.clock.now(),
    });
  }

  /** Nhật ký thao tác, mới nhất trước (Q67). */
  async list({ page, pageSize, ...filter }: Page & AuditFilter) {
    const conditions: SQL[] = [];
    if (filter.actorId) conditions.push(eq(auditLogs.actorId, filter.actorId));
    if (filter.action) conditions.push(eq(auditLogs.action, filter.action));
    if (filter.entityType) conditions.push(eq(auditLogs.entityType, filter.entityType));
    if (filter.entityId) conditions.push(eq(auditLogs.entityId, filter.entityId));
    const where = and(...conditions);

    const [totalRow] = await this.db.select({ total: count() }).from(auditLogs).where(where);
    const items = await this.db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorName: users.fullName,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        before: auditLogs.before,
        after: auditLogs.after,
        ip: auditLogs.ip,
        at: auditLogs.at,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.at), desc(auditLogs.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { total: totalRow?.total ?? 0, page, pageSize, items };
  }
}
