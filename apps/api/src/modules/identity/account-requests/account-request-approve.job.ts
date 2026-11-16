import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../../common/clock';
import { uniqueViolationOf } from '../../../common/pg-error';
import { type Database, DB, type Transaction } from '../../../db/db.module';
import { type JobPayloads, JobRegistry } from '../../../queue/job-queue';
import { AuditService } from '../../audit/audit.service';
import { MailService } from '../../mail/mail.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  accountRequestItems,
  accountRequests,
  authTokens,
  userRoleTags,
  users,
} from '../identity.schema';
import { settleRequest } from './account-request-settle';
import { normalizePersonName } from './person-name';

type Payload = JobPayloads['account-request.approve'];
type Item = typeof accountRequestItems.$inferSelect;

/** Kết quả xử lý một dòng. */
type ItemResult =
  | { outcome: 'created'; userId: string }
  | { outcome: 'restored'; userId: string }
  /** `userId`: chỉ có khi dòng được gộp vào tài khoản vừa được Yêu cầu khác tạo (P2). */
  | { outcome: 'tag_added'; userId?: string }
  | { outcome: 'skipped'; note: string };

// Ràng buộc UNIQUE của bảng users → trường bị trùng.
const TAKEN_BY_CONSTRAINT: Record<string, string> = {
  users_username_active_key: 'username_taken',
  users_email_active_key: 'email_taken',
  users_code_active_key: 'code_taken',
};

/**
 * Job "account-request.approve" (Q91–Q93, ADR-0009): tạo tài khoản Người dự thi Chờ kích hoạt (không mật khẩu) hoặc thêm
 * vai trò cho các dòng đã duyệt. Mỗi tài khoản mới xếp MỘT thư kích hoạt trong cùng giao dịch với việc tạo tài khoản
 * (làn hàng loạt, người xếp là Người ra đề tạo Yêu cầu); người dùng tự đặt mật khẩu bằng liên kết trong thư, nên không
 * còn mật khẩu tạm hay Phiếu tài khoản và không ai khác biết mật khẩu.
 */
@Injectable()
export class AccountRequestApproveJob implements OnModuleInit {
  private readonly logger = new Logger(AccountRequestApproveJob.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly mail: MailService,
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
        if (item.matchStatus === 'restore') {
          await this.restoreCandidate(
            item,
            { id: reviewerId, ip: reviewerIp },
            request.requestedBy,
          );
        } else if (item.userId) await this.addCandidateTag(item, reviewerId);
        else await this.createCandidate(item, reviewerId, request.requestedBy);
      } catch (error) {
        // Lỗi bất ngờ: dừng ở đây. Các dòng chưa xử lý vẫn `pending`, Quản trị viên duyệt lại được.
        this.logger.error(`Duyệt dòng ${item.rowNumber} của yêu cầu ${requestId} lỗi`, error);
        interrupted = true;
        break;
      }
    }

    // Một lần kích job gửi cho cả đợt (thư đã nằm bền trong cơ sở dữ liệu, kích chỉ để gửi sớm).
    await this.mail.wake();

    await this.db.transaction(async (tx) => {
      const [tally] = await tx
        .select({
          created: sql<number>`count(*) FILTER (WHERE ${accountRequestItems.outcome} = 'created')::int`,
          tagAdded: sql<number>`count(*) FILTER (WHERE ${accountRequestItems.outcome} = 'tag_added')::int`,
          restored: sql<number>`count(*) FILTER (WHERE ${accountRequestItems.outcome} = 'restored')::int`,
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
            restored: tally?.restored ?? 0,
            skipped: tally?.skipped ?? 0,
            rejected: rejectedCount,
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

  /** Người mới: tên đăng nhập = `lower(code)`, không có mã thì dùng email (data-model). Không mật khẩu: Chờ kích hoạt. */
  private async createCandidate(
    item: Item,
    reviewerId: string,
    requesterId: string,
  ): Promise<void> {
    const username = item.code ? item.code.toLowerCase() : (item.email as string);
    const now = this.clock.now();

    try {
      await this.db.transaction(async (tx) => {
        // Trong lúc chờ duyệt, người khác có thể đã chiếm tên đăng nhập, mã hoặc email.
        const taken = await this.takenField(tx, item, username);
        if (taken) {
          // Tài khoản vừa được Yêu cầu khác tạo (cùng mã hoặc email, họ tên khớp): coi là "khớp có sẵn" (P2).
          const same = await this.sameCandidate(tx, item);
          if (same) {
            await tx
              .insert(userRoleTags)
              .values({ userId: same, tag: 'candidate', grantedBy: reviewerId, grantedAt: now })
              .onConflictDoNothing();
            await this.markItem(tx, item, { outcome: 'tag_added', userId: same });
            return;
          }
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
            createdBy: reviewerId,
          })
          .returning({ id: users.id });
        if (!created) throw new Error('Không tạo được tài khoản Người dự thi');
        await tx
          .insert(userRoleTags)
          .values({ userId: created.id, tag: 'candidate', grantedBy: reviewerId, grantedAt: now });
        // Thư kích hoạt cùng giao dịch với tài khoản: không có tài khoản mà thiếu thư, hay thư mà thiếu tài khoản.
        await this.mail.enqueueIn(tx, [
          {
            kind: 'activation',
            toEmail: item.email as string,
            lane: 'bulk',
            userId: created.id,
            requestedBy: requesterId,
          },
        ]);
        await this.markItem(tx, item, { outcome: 'created', userId: created.id });
      });
    } catch (error) {
      const note = TAKEN_BY_CONSTRAINT[uniqueViolationOf(error) ?? ''];
      if (!note) throw error;
      await this.db.transaction((tx) => this.markItem(tx, item, { outcome: 'skipped', note }));
    }
  }

  /**
   * Dòng "khôi phục" (C-gọn): đưa chính tài khoản Người dự thi đã Xóa trở lại, về Chờ kích hoạt, email lấy từ file, một thư
   * kích hoạt mới. Họ tên, mã, lượt làm bài và điểm cũ giữ nguyên (cùng `id`). Một giao dịch.
   */
  private async restoreCandidate(
    item: Item,
    reviewer: { id: string; ip: string | null },
    requesterId: string,
  ): Promise<void> {
    const now = this.clock.now();
    try {
      await this.db.transaction(async (tx) => {
        const [user] = await tx
          .select({
            id: users.id,
            isAdmin: users.isAdmin,
            removedAt: users.removedAt,
            code: users.code,
          })
          .from(users)
          .where(eq(users.id, item.userId as string))
          .for('update');
        const tags = user
          ? await tx
              .select({ tag: userRoleTags.tag })
              .from(userRoleTags)
              .where(eq(userRoleTags.userId, user.id))
          : [];
        // Từ lúc đọc file tới lúc duyệt người đó có thể đã được khôi phục, thành Quản trị viên hay thêm vai trò khác.
        if (!user || !user.removedAt || user.isAdmin || tags.some((t) => t.tag !== 'candidate')) {
          await this.markItem(tx, item, { outcome: 'skipped', note: 'restore_state_changed' });
          return;
        }
        await tx
          .update(users)
          .set({
            removedAt: null,
            removedBy: null,
            status: 'active',
            lockedAt: null,
            lockedBy: null,
            lockedReason: null,
            passwordHash: null,
            mustChangePassword: true,
            passwordExpiresAt: null,
            activatedAt: null,
            emailVerifiedAt: null,
            email: item.email,
            code: user.code ?? item.code,
          })
          .where(eq(users.id, user.id));
        await tx
          .insert(userRoleTags)
          .values({ userId: user.id, tag: 'candidate', grantedBy: reviewer.id, grantedAt: now })
          .onConflictDoNothing();
        // Liên kết cũ của tài khoản (kích hoạt, hỗ trợ...) không được sống lại cùng tài khoản.
        await tx
          .update(authTokens)
          .set({ replacedAt: now })
          .where(
            and(
              eq(authTokens.userId, user.id),
              isNull(authTokens.usedAt),
              isNull(authTokens.replacedAt),
            ),
          );
        await this.mail.enqueueIn(tx, [
          {
            kind: 'activation',
            toEmail: item.email as string,
            lane: 'bulk',
            userId: user.id,
            requestedBy: requesterId,
          },
        ]);
        await this.audit.record(
          {
            actor: reviewer,
            action: 'user.restore',
            entityType: 'user',
            entityId: user.id,
            before: { removedAt: user.removedAt },
            after: { removedAt: null, requestId: item.requestId, email: item.email },
          },
          tx,
        );
        await this.markItem(tx, item, { outcome: 'restored', userId: user.id });
      });
    } catch (error) {
      const note = TAKEN_BY_CONSTRAINT[uniqueViolationOf(error) ?? ''];
      if (!note) throw error;
      await this.db.transaction((tx) => this.markItem(tx, item, { outcome: 'skipped', note }));
    }
  }

  /**
   * Tài khoản đang dùng mà dòng này thực chất là cùng một người (P2): duy nhất một người khớp theo mã hoặc email, không phải
   * Quản trị viên, họ tên khớp (bỏ dấu, không phân biệt hoa thường). Trả `null` nếu không chắc: dòng sẽ bị bỏ qua như cũ.
   */
  private async sameCandidate(tx: Transaction, item: Item): Promise<string | null> {
    const conditions = [];
    if (item.email) conditions.push(eq(users.email, item.email));
    if (item.code) conditions.push(sql`lower(${users.code}) = ${item.code.toLowerCase()}`);
    if (conditions.length === 0) return null;
    const found = await tx
      .select({ id: users.id, fullName: users.fullName, isAdmin: users.isAdmin })
      .from(users)
      .where(and(isNull(users.removedAt), sql`(${sql.join(conditions, sql` OR `)})`));
    const [only] = found;
    if (found.length !== 1 || !only || only.isAdmin) return null;
    return normalizePersonName(only.fullName) === normalizePersonName(item.fullName ?? '')
      ? only.id
      : null;
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
        userId: 'userId' in result && result.userId ? result.userId : item.userId,
        outcomeNote: result.outcome === 'skipped' ? result.note : null,
      })
      .where(and(eq(accountRequestItems.id, item.id), eq(accountRequestItems.outcome, 'pending')));
  }
}
