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

/** Kết quả xử lý một dòng. */
type ItemResult =
  | { outcome: 'created'; userId: string }
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

    // Một hạn chung cho cả đợt: mật khẩu tạm của mọi tài khoản và Phiếu tài khoản cùng hết hạn (Q21).
    const expiresAt = new Date(this.clock.now().getTime() + TEMPORARY_PASSWORD_TTL_MS);
    const pending = await this.db
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

    let interrupted = false;
    for (const item of pending) {
      try {
        if (item.userId) await this.addCandidateTag(item, reviewerId);
        else await this.createCandidate(item, reviewerId, expiresAt);
      } catch (error) {
        // Lỗi bất ngờ: dừng ở đây. Các dòng chưa xử lý vẫn `pending`, Quản trị viên duyệt lại được.
        this.logger.error(`Duyệt dòng ${item.rowNumber} của yêu cầu ${requestId} lỗi`, error);
        interrupted = true;
        break;
      }
    }

    // Dựng phiếu từ thông tin đã mã hóa lưu lúc tạo tài khoản, không từ bộ nhớ: job chết rồi chạy lại vẫn dựng đủ.
    const slip = await this.createSlip(requestId, reviewerId, request.requestedBy, itemIds);

    await this.db.transaction(async (tx) => {
      const [tally] = await tx
        .select({
          created: sql<number>`count(*) FILTER (WHERE ${accountRequestItems.outcome} = 'created')::int`,
          tagAdded: sql<number>`count(*) FILTER (WHERE ${accountRequestItems.outcome} = 'tag_added')::int`,
          skipped: sql<number>`count(*) FILTER (WHERE ${accountRequestItems.outcome} = 'skipped')::int`,
        })
        .from(accountRequestItems)
        .where(
          and(
            eq(accountRequestItems.requestId, requestId),
            inArray(accountRequestItems.id, itemIds),
          ),
        );
      const status = await settleRequest(tx, requestId, reviewerId, this.clock.now());
      await this.audit.record(
        {
          actor: { id: reviewerId, ip: reviewerIp },
          action: 'account-request.approve',
          entityType: 'account_request',
          entityId: requestId,
          after: {
            approved: itemIds.length,
            created: tally?.created ?? 0,
            tagAdded: tally?.tagAdded ?? 0,
            skipped: tally?.skipped ?? 0,
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
      if (interrupted) {
        await this.notifications.notify(
          {
            userIds: [reviewerId],
            type: 'account_request.approve_interrupted',
            data: { requestId },
          },
          tx,
        );
      }
    });
  }

  /** Người đã có tài khoản: chỉ thêm vai trò Người dự thi (không sửa thông tin của họ). */
  private async addCandidateTag(item: Item, reviewerId: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, isAdmin: users.isAdmin, removedAt: users.removedAt })
        .from(users)
        .where(eq(users.id, item.userId as string))
        .for('update');
      if (!user || user.removedAt || user.isAdmin) {
        await this.markItem(tx, item, { outcome: 'skipped', note: 'user_unavailable' });
        return;
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
      await this.markItem(tx, item, { outcome: 'tag_added' });
    });
  }

  /** Người mới: tên đăng nhập = `lower(code)`, không có mã thì dùng email (data-model). */
  private async createCandidate(item: Item, reviewerId: string, expiresAt: Date): Promise<void> {
    const username = item.code ? item.code.toLowerCase() : (item.email as string);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const now = this.clock.now();

    try {
      await this.db.transaction(async (tx) => {
        // Trong lúc chờ duyệt, người khác có thể đã chiếm tên đăng nhập, mã hoặc email.
        const taken = await this.takenField(tx, item, username);
        if (taken) {
          await this.markItem(tx, item, { outcome: 'skipped', note: taken });
          return;
        }

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
            passwordExpiresAt: expiresAt,
            createdBy: reviewerId,
          })
          .returning({ id: users.id });
        if (!created) throw new Error('Không tạo được tài khoản Người dự thi');
        await tx
          .insert(userRoleTags)
          .values({ userId: created.id, tag: 'candidate', grantedBy: reviewerId, grantedAt: now });
        const entry: SlipEntry = {
          fullName: item.fullName ?? '',
          code: item.code,
          classLabel: item.classLabel,
          username,
          temporaryPassword,
        };
        // Ghi thông tin phiếu (mã hóa) trước khi commit: tài khoản đã có thì mật khẩu chắc chắn còn lấy lại được.
        // Nếu commit lỗi, file mồ côi vô hại vì phiếu chỉ lấy theo các dòng đã `created`.
        await this.media.put(
          this.credentialKey(item),
          this.vault.encrypt(Buffer.from(JSON.stringify({ entry, expiresAt }))),
        );
        await this.markItem(tx, item, { outcome: 'created', userId: created.id });
      });
    } catch (error) {
      const note = TAKEN_BY_CONSTRAINT[uniqueViolationOf(error) ?? ''];
      if (!note) throw error;
      await this.db.transaction((tx) => this.markItem(tx, item, { outcome: 'skipped', note }));
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

  private async markItem(tx: Transaction, item: Item, result: ItemResult): Promise<void> {
    await tx
      .update(accountRequestItems)
      .set({
        outcome: result.outcome,
        userId: result.outcome === 'created' ? result.userId : item.userId,
        outcomeNote: result.outcome === 'skipped' ? result.note : null,
      })
      .where(and(eq(accountRequestItems.id, item.id), eq(accountRequestItems.outcome, 'pending')));
  }

  private credentialKey(item: Pick<Item, 'id' | 'requestId'>) {
    return `slips/pending/${item.requestId}/${item.id}.enc`;
  }

  /**
   * Dựng và lưu Phiếu tài khoản của đợt duyệt từ các file thông tin đã mã hóa (một file mỗi tài khoản mới).
   * Trả null nếu không còn file nào (không có tài khoản mới, hoặc phiếu đã dựng ở lần chạy trước).
   * Dựng lỗi thì ghi phiếu `failed`: tài khoản đã tạo, người quản trị dùng "Cấp lại mật khẩu tạm".
   */
  private async createSlip(
    requestId: string,
    reviewerId: string,
    requesterId: string,
    itemIds: string[],
  ) {
    const items = await this.db
      .select()
      .from(accountRequestItems)
      .where(
        and(
          eq(accountRequestItems.requestId, requestId),
          inArray(accountRequestItems.id, itemIds),
          inArray(accountRequestItems.outcome, ['created', 'tag_added']),
        ),
      )
      .orderBy(asc(accountRequestItems.rowNumber));

    const entries: SlipEntry[] = [];
    const listRows: SlipListRow[] = [];
    const credentialKeys: string[] = [];
    let expiresAt: Date | null = null;
    for (const item of items) {
      let entry: SlipEntry | null = null;
      if (item.outcome === 'created') {
        const stored = await this.readCredential(item);
        if (stored) {
          entry = stored.entry;
          entries.push(stored.entry);
          credentialKeys.push(this.credentialKey(item));
          if (!expiresAt || stored.expiresAt < expiresAt) expiresAt = stored.expiresAt;
        }
      }
      listRows.push({
        fullName: item.fullName ?? '',
        code: item.code,
        classLabel: item.classLabel,
        username: entry?.username ?? item.code?.toLowerCase() ?? item.email,
        outcome: item.outcome === 'created' ? 'created' : 'tag_added',
      });
    }
    if (entries.length === 0 || !expiresAt) return null;

    const id = uuidv7();
    const base = {
      id,
      requestId,
      createdBy: reviewerId,
      itemCount: entries.length,
      expiresAt,
      createdAt: this.clock.now(),
    };
    let slip: typeof credentialSlips.$inferInsert;
    try {
      const files = await this.renderer.render({
        entries,
        listRows: listRows.map((row) =>
          row.outcome === 'tag_added' ? { ...row, username: null } : row,
        ),
        loginUrl: `${this.env.APP_ORIGINS[0] ?? ''}/login`,
        expiresAt,
      });
      const pdfKey = `slips/${id}.pdf.enc`;
      const xlsxKey = `slips/${id}.xlsx.enc`;
      await this.media.put(pdfKey, this.vault.encrypt(files.pdf));
      await this.media.put(xlsxKey, this.vault.encrypt(files.xlsx));
      slip = { ...base, status: 'ready', pdfKey, xlsxKey };
    } catch (error) {
      this.logger.error(`Không dựng được Phiếu tài khoản của yêu cầu ${requestId}`, error);
      slip = { ...base, status: 'failed' };
    }

    // Lưu phiếu và báo "phiếu sẵn sàng" trong một transaction: lỗi ở đây thì file thông tin còn đó, job chạy lại sẽ dựng lại.
    await this.db.transaction(async (tx) => {
      await tx.insert(credentialSlips).values(slip);
      await this.notifications.notify(
        {
          userIds: [reviewerId, requesterId],
          type: 'credential_slip.ready',
          data: { requestId, slipId: id, status: slip.status },
        },
        tx,
      );
    });
    // Phiếu đã lưu: thông tin tạm không còn cần, xóa để mật khẩu không nằm lại trên đĩa.
    for (const key of credentialKeys) await this.media.delete(key);
    return { id, status: slip.status };
  }

  private async readCredential(item: Item): Promise<{ entry: SlipEntry; expiresAt: Date } | null> {
    try {
      const raw = await this.media.get(this.credentialKey(item));
      const parsed = JSON.parse(this.vault.decrypt(raw).toString('utf8')) as {
        entry: SlipEntry;
        expiresAt: string;
      };
      return { entry: parsed.entry, expiresAt: new Date(parsed.expiresAt) };
    } catch {
      return null; // không có file: phiếu đã dựng ở lần chạy trước
    }
  }
}
