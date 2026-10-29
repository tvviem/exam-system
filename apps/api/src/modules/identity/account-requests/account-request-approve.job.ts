import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { CLOCK, type Clock } from '../../../common/clock';
import { uniqueViolationOf } from '../../../common/pg-error';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { type Database, DB, type Transaction } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { type JobPayloads, JobRegistry } from '../../../queue/job-queue';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  SLIP_RENDERER,
  type SlipEntry,
  type SlipListRow,
  type SlipRenderer,
} from '../credential-slips/slip-renderer';
import { SlipVault } from '../credential-slips/slip-vault';
import {
  accountRequestItems,
  accountRequests,
  credentialSlips,
  userRoleTags,
  users,
} from '../identity.schema';
import { hashPassword } from '../password/password-hasher';
import {
  generateTemporaryPassword,
  TEMPORARY_PASSWORD_TTL_MS,
} from '../password/temporary-password';
import { settleRequest } from './account-request-settle';

type Payload = JobPayloads['account-request.approve'];
type Item = typeof accountRequestItems.$inferSelect;

/** Kết quả xử lý một dòng. `entry` chỉ có khi vừa tạo tài khoản mới (mang mật khẩu tạm). */
type ItemResult =
  | { outcome: 'created'; entry: SlipEntry; userId: string }
  | { outcome: 'tag_added' }
  | { outcome: 'skipped'; note: string };

// Ràng buộc UNIQUE của bảng users → trường bị trùng.
const TAKEN_BY_CONSTRAINT: Record<string, string> = {
  users_username_active_key: 'username_taken',
  users_email_active_key: 'email_taken',
  users_code_active_key: 'code_taken',
};

/**
 * Job "account-request.approve" (Q91–Q93): tạo tài khoản Người dự thi hoặc thêm vai trò cho các dòng đã
 * duyệt, rồi dựng Phiếu tài khoản. Băm Argon2 nặng nên chạy ở worker. Mật khẩu dạng rõ chỉ tồn tại trong
 * bộ nhớ tiến trình này: sang phiếu mã hóa trên MediaStore, không vào DB, nhật ký, thông báo hay log.
 */
@Injectable()
export class AccountRequestApproveJob implements OnModuleInit {
  private readonly logger = new Logger(AccountRequestApproveJob.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    @Inject(SLIP_RENDERER) private readonly renderer: SlipRenderer,
    private readonly vault: SlipVault,
    private readonly registry: JobRegistry,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.registry.register('account-request.approve', (payload) => this.run(payload));
  }

  async run({ requestId, itemIds, reviewerId, reviewerIp, rejectedCount }: Payload): Promise<void> {
    const [request] = await this.db
      .select()
      .from(accountRequests)
      .where(and(eq(accountRequests.id, requestId), eq(accountRequests.status, 'approving')));
    if (!request) return; // đã xử lý xong (job giao lại) hoặc yêu cầu không còn ở trạng thái duyệt

    const items = await this.db
      .select()
      .from(accountRequestItems)
      .where(
        and(
          eq(accountRequestItems.requestId, requestId),
          inArray(accountRequestItems.id, itemIds),
          eq(accountRequestItems.outcome, 'pending'),
        ),
      )
      .orderBy(asc(accountRequestItems.rowNumber));

    const entries: SlipEntry[] = [];
    const listRows: SlipListRow[] = [];
    const tally = { created: 0, tagAdded: 0, skipped: 0 };
    for (const item of items) {
      try {
        const result = item.userId
          ? await this.addCandidateTag(item, reviewerId)
          : await this.createCandidate(item, reviewerId);
        if (result.outcome === 'created') {
          tally.created++;
          entries.push(result.entry);
        } else if (result.outcome === 'tag_added') {
          tally.tagAdded++;
        } else {
          tally.skipped++;
        }
        if (result.outcome !== 'skipped') {
          listRows.push({
            fullName: item.fullName ?? '',
            code: item.code,
            classLabel: item.classLabel,
            username: result.outcome === 'created' ? result.entry.username : null,
            outcome: result.outcome,
          });
        }
      } catch (error) {
        // Lỗi bất ngờ: dừng ở đây. Các dòng chưa xử lý vẫn `pending`, Quản trị viên duyệt lại được.
        this.logger.error(`Duyệt dòng ${item.rowNumber} của yêu cầu ${requestId} lỗi`, error);
        break;
      }
    }

    const slip =
      entries.length > 0 ? await this.createSlip(requestId, reviewerId, entries, listRows) : null;

    await this.db.transaction(async (tx) => {
      const now = this.clock.now();
      const status = await settleRequest(tx, requestId, reviewerId, now);
      await this.audit.record(
        {
          actor: { id: reviewerId, ip: reviewerIp },
          action: 'account-request.approve',
          entityType: 'account_request',
          entityId: requestId,
          after: {
            approved: items.length,
            ...tally,
            rejected: rejectedCount,
            ...(slip ? { slipId: slip.id } : {}),
          },
        },
        tx,
      );
      if (status !== 'pending') {
        await this.notifications.notify(
          {
            userIds: [request.requestedBy],
            type: 'account_request.reviewed',
            data: { requestId, status },
          },
          tx,
        );
      }
      if (slip) {
        await this.notifications.notify(
          {
            userIds: [reviewerId, request.requestedBy],
            type: 'credential_slip.ready',
            data: { requestId, slipId: slip.id, status: slip.status },
          },
          tx,
        );
      }
    });
  }

  /** Người đã có tài khoản: chỉ thêm vai trò Người dự thi (không sửa thông tin của họ). */
  private async addCandidateTag(item: Item, reviewerId: string): Promise<ItemResult> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, isAdmin: users.isAdmin, removedAt: users.removedAt })
        .from(users)
        .where(eq(users.id, item.userId as string))
        .for('update');
      if (!user || user.removedAt || user.isAdmin) {
        return this.markItem(tx, item, { outcome: 'skipped', note: 'user_unavailable' });
      }
      await tx
        .insert(userRoleTags)
        .values({
          userId: user.id,
          tag: 'candidate',
          grantedBy: reviewerId,
          grantedAt: this.clock.now(),
        })
        .onConflictDoNothing();
      return this.markItem(tx, item, { outcome: 'tag_added' });
    });
  }

  /** Người mới: tên đăng nhập = `lower(code)`, không có mã thì dùng email (data-model). */
  private async createCandidate(item: Item, reviewerId: string): Promise<ItemResult> {
    const username = item.code ? item.code.toLowerCase() : (item.email as string);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const now = this.clock.now();

    try {
      return await this.db.transaction(async (tx) => {
        // Trong lúc chờ duyệt, người khác có thể đã chiếm tên đăng nhập, mã hoặc email.
        const taken = await this.takenField(tx, item, username);
        if (taken) return this.markItem(tx, item, { outcome: 'skipped', note: taken });

        const [created] = await tx
          .insert(users)
          .values({
            username,
            email: item.email,
            code: item.code,
            fullName: item.fullName ?? '',
            classLabel: item.classLabel,
            dateOfBirth: item.dateOfBirth,
            gender: item.gender,
            passwordHash,
            mustChangePassword: true,
            passwordExpiresAt: new Date(now.getTime() + TEMPORARY_PASSWORD_TTL_MS),
            createdBy: reviewerId,
          })
          .returning({ id: users.id });
        if (!created) throw new Error('Không tạo được tài khoản Người dự thi');
        await tx
          .insert(userRoleTags)
          .values({ userId: created.id, tag: 'candidate', grantedBy: reviewerId, grantedAt: now });
        return this.markItem(tx, item, {
          outcome: 'created',
          userId: created.id,
          entry: {
            fullName: item.fullName ?? '',
            code: item.code,
            classLabel: item.classLabel,
            username,
            temporaryPassword,
          },
        });
      });
    } catch (error) {
      const note = TAKEN_BY_CONSTRAINT[uniqueViolationOf(error) ?? ''];
      if (!note) throw error;
      return this.db.transaction((tx) => this.markItem(tx, item, { outcome: 'skipped', note }));
    }
  }

  private async takenField(tx: Transaction, item: Item, username: string): Promise<string | null> {
    const conditions = [eq(users.username, username)];
    if (item.email) conditions.push(eq(users.email, item.email));
    if (item.code) conditions.push(sql`lower(${users.code}) = ${item.code.toLowerCase()}`);
    const rows = await tx
      .select({ username: users.username, email: users.email, code: users.code })
      .from(users)
      .where(and(isNull(users.removedAt), sql`(${sql.join(conditions, sql` OR `)})`));
    if (rows.some((r) => r.username?.toLowerCase() === username.toLowerCase()))
      return 'username_taken';
    if (item.code && rows.some((r) => r.code?.toLowerCase() === item.code?.toLowerCase()))
      return 'code_taken';
    return rows.length > 0 ? 'email_taken' : null;
  }

  private async markItem<R extends ItemResult>(tx: Transaction, item: Item, result: R): Promise<R> {
    await tx
      .update(accountRequestItems)
      .set({
        outcome: result.outcome,
        userId: result.outcome === 'created' ? result.userId : item.userId,
        outcomeNote: result.outcome === 'skipped' ? result.note : null,
      })
      .where(and(eq(accountRequestItems.id, item.id), eq(accountRequestItems.outcome, 'pending')));
    return result;
  }

  /** Dựng và lưu Phiếu tài khoản. Dựng lỗi thì ghi phiếu `failed`: tài khoản đã tạo, dùng "Cấp lại mật khẩu tạm". */
  private async createSlip(
    requestId: string,
    reviewerId: string,
    entries: SlipEntry[],
    listRows: SlipListRow[],
  ) {
    const id = uuidv7();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + TEMPORARY_PASSWORD_TTL_MS);
    const base = {
      id,
      requestId,
      createdBy: reviewerId,
      itemCount: entries.length,
      expiresAt,
      createdAt: now,
    };
    try {
      const files = await this.renderer.render({
        entries,
        listRows,
        loginUrl: `${this.env.APP_ORIGINS[0] ?? ''}/login`,
        expiresAt,
      });
      const pdfKey = `slips/${id}.pdf.enc`;
      const xlsxKey = `slips/${id}.xlsx.enc`;
      await this.media.put(pdfKey, this.vault.encrypt(files.pdf));
      await this.media.put(xlsxKey, this.vault.encrypt(files.xlsx));
      await this.db.insert(credentialSlips).values({ ...base, status: 'ready', pdfKey, xlsxKey });
      return { id, status: 'ready' as const };
    } catch (error) {
      this.logger.error(`Không dựng được Phiếu tài khoản của yêu cầu ${requestId}`, error);
      await this.db.insert(credentialSlips).values({ ...base, status: 'failed' });
      return { id, status: 'failed' as const };
    }
  }
}
