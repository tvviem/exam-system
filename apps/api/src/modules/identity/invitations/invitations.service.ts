import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ne, sql } from 'drizzle-orm';
import type { Actor } from '../../../common/actor';
import { ApiError, validationFailed } from '../../../common/api-error';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Page, paginate } from '../../../common/pagination';
import { type Database, DB, type Transaction as Tx } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import { MailService } from '../../mail/mail.service';
import { invitations, units, userRoleTags, users } from '../identity.schema';
import { findActiveUserByEmail } from '../users.repository';
import {
  type InvitationStatus,
  invitationStatusCondition,
  invitationStatusOf,
} from './invitation-status';
import { generateInvitationToken } from './invitation-token';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type InvitationRow = typeof invitations.$inferSelect;

export interface InvitationInput {
  email: string;
  fullName: string;
  unitId: string;
}

/** Lời mời trở thành Người ra đề: phần Quản trị viên (PR 1c). */
@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async list({ page, pageSize, status }: Page & { status?: InvitationStatus }) {
    const now = this.clock.now();
    const where = status ? invitationStatusCondition(status, now) : undefined;
    const result = await paginate(
      { page, pageSize },
      () => this.db.select({ total: count() }).from(invitations).where(where),
      (limit, offset) =>
        this.db
          .select({
            id: invitations.id,
            email: invitations.email,
            fullName: invitations.fullName,
            unitId: invitations.unitId,
            unitName: units.name,
            invitedByName: users.fullName,
            expiresAt: invitations.expiresAt,
            acceptedAt: invitations.acceptedAt,
            revokedAt: invitations.revokedAt,
            createdAt: invitations.createdAt,
          })
          .from(invitations)
          .innerJoin(units, eq(units.id, invitations.unitId))
          .innerJoin(users, eq(users.id, invitations.invitedBy))
          .where(where)
          .orderBy(desc(invitations.createdAt), desc(invitations.id))
          .limit(limit)
          .offset(offset),
    );
    return {
      ...result,
      items: result.items.map(({ acceptedAt, revokedAt, ...item }) => ({
        ...item,
        acceptedAt,
        status: invitationStatusOf({ acceptedAt, revokedAt, expiresAt: item.expiresAt }, now),
      })),
    };
  }

  /**
   * Tạo Lời mời và xếp thư mời. Mã KHÔNG được sinh ở đây mà sinh LÚC GỬI (Q381, bộ dựng thư của `identity`): hàng đợi thư không
   * chứa mã. Tới lúc đó `token_hash` là giá trị tạm không ai biết, nên chưa có liên kết nào dùng được.
   */
  async create(actor: Actor, input: InvitationInput) {
    const email = input.email.trim();
    const { tokenHash } = generateInvitationToken();
    const now = this.clock.now();
    const row = await this.db.transaction(async (tx) => {
      await this.lockEmail(tx, email);
      const [unit] = await tx
        .select({ id: units.id })
        .from(units)
        .where(eq(units.id, input.unitId));
      if (!unit) throw validationFailed('unitId', 'unit_not_found');
      await this.assertEmailInvitable(tx, email);
      await this.assertNoOpenInvitation(tx, email, now);
      const [created] = await tx
        .insert(invitations)
        .values({
          email,
          fullName: input.fullName,
          unitId: input.unitId,
          tokenHash,
          invitedBy: actor.id,
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        })
        .returning();
      if (!created) throw new Error('Không tạo được Lời mời');
      await this.audit.record(
        {
          actor,
          action: 'invitation.create',
          entityType: 'invitation',
          entityId: created.id,
          after: { email, fullName: input.fullName, unitId: input.unitId },
        },
        tx,
      );
      return created;
    });
    await this.queueMail(actor, row);
    return this.present(row, now);
  }

  /** Xếp thư mời; `invitationId` là dữ liệu không bí mật để bộ dựng thư tìm đúng Lời mời lúc gửi. */
  private queueMail(actor: Actor, row: InvitationRow) {
    return this.mail.enqueue({
      kind: 'invitation',
      toEmail: row.email,
      lane: 'urgent',
      requestedBy: actor.id,
      context: { invitationId: row.id },
    });
  }

  async revoke(actor: Actor, id: string) {
    const now = this.clock.now();
    const row = await this.db.transaction(async (tx) => {
      const invitation = await this.lockOrThrow(tx, id);
      if (invitationStatusOf(invitation, now) !== 'pending') throw new ApiError('INVALID_STATE');
      const [updated] = await tx
        .update(invitations)
        .set({ revokedAt: now })
        .where(eq(invitations.id, id))
        .returning();
      await this.audit.record(
        { actor, action: 'invitation.revoke', entityType: 'invitation', entityId: id },
        tx,
      );
      return updated ?? invitation;
    });
    // Thu hồi trước khi thư kịp gửi thì thư không gửi nữa.
    await this.mail.cancelPending('invitation', { invitationId: id });
    return this.present(row, now);
  }

  /** Liên kết cũ chết NGAY (`token_hash` đổi thành giá trị tạm); liên kết mới do thư mới mang tới lúc gửi. */
  async regenerate(actor: Actor, id: string) {
    const now = this.clock.now();
    const { tokenHash } = generateInvitationToken();
    const row = await this.db.transaction(async (tx) => {
      const invitation = await this.lockOrThrow(tx, id);
      const status = invitationStatusOf(invitation, now);
      if (status !== 'pending' && status !== 'expired') throw new ApiError('INVALID_STATE');
      await this.lockEmail(tx, invitation.email);
      await this.assertEmailInvitable(tx, invitation.email);
      await this.assertNoOpenInvitation(tx, invitation.email, now, id);
      const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
      const [updated] = await tx
        .update(invitations)
        .set({ tokenHash, expiresAt })
        .where(eq(invitations.id, id))
        .returning();
      await this.audit.record(
        {
          actor,
          action: 'invitation.regenerate',
          entityType: 'invitation',
          entityId: id,
          after: { expiresAt },
        },
        tx,
      );
      return updated ?? invitation;
    });
    await this.queueMail(actor, row);
    return this.present(row, now);
  }

  /** Hai Quản trị viên cùng mời hoặc Tạo lại link cho một email: tuần tự hóa để kiểm tra không bị lọt. */
  private lockEmail(tx: Tx, email: string) {
    return tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${email.toLowerCase()}))`);
  }

  /** Q79: không mời Quản trị viên, không mời người đã là Người ra đề. */
  private async assertEmailInvitable(tx: Tx, email: string) {
    const account = await findActiveUserByEmail(tx, email);
    if (!account) return;
    if (account.isAdmin) throw validationFailed('email', 'email_belongs_to_admin');
    const [tag] = await tx
      .select({ tag: userRoleTags.tag })
      .from(userRoleTags)
      .where(and(eq(userRoleTags.userId, account.id), eq(userRoleTags.tag, 'examiner')));
    if (tag) throw validationFailed('email', 'already_examiner');
  }

  private async assertNoOpenInvitation(tx: Tx, email: string, now: Date, exceptId?: string) {
    const [open] = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          invitationStatusCondition('pending', now),
          exceptId ? ne(invitations.id, exceptId) : undefined,
        ),
      );
    if (open) throw new ApiError('CONFLICT', { field: 'email' });
  }

  private async lockOrThrow(tx: Tx, id: string): Promise<InvitationRow> {
    const [row] = await tx.select().from(invitations).where(eq(invitations.id, id)).for('update');
    if (!row) throw new ApiError('NOT_FOUND');
    return row;
  }

  private present(row: InvitationRow, now: Date) {
    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      unitId: row.unitId,
      status: invitationStatusOf(row, now),
      expiresAt: row.expiresAt,
    };
  }
}
