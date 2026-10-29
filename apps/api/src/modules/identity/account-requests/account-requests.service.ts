import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import type { Actor } from '../../../common/actor';
import { ApiError, validationFailed } from '../../../common/api-error';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Page, paginate } from '../../../common/pagination';
import { type Database, DB } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { JOB_QUEUE, type JobQueue } from '../../../queue/job-queue';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { accountRequestItems, accountRequests, users } from '../identity.schema';
import { MAX_UPLOAD_BYTES, sniffUpload } from './account-request-file';
import { settleRequest } from './account-request-settle';

export type AccountRequestStatus = (typeof accountRequests.$inferSelect)['status'];
export type MatchStatusValue = (typeof accountRequestItems.$inferSelect)['matchStatus'];

export const NOTE_MAX = 1000;
const FILENAME_MAX = 255;

/** Người ra đề thấy yêu cầu của mình, Quản trị viên thấy tất cả (Q97). */
export const canViewAccountRequests = (user: AuthenticatedUser) =>
  user.isAdmin || user.roleTags.includes('examiner');

const trimmedNote = (note: string | null | undefined) => note?.trim().slice(0, NOTE_MAX) || null;

/** Người ra đề chỉ xem yêu cầu của mình; Quản trị viên (undefined) xem tất cả. */
const scopeOf = (user: AuthenticatedUser) => (user.isAdmin ? undefined : user.id);

/** Lý do chặn nói rõ tài khoản khớp là loại nào (Quản trị viên, đã Xóa...) chỉ dành cho Quản trị viên. */
const ADMIN_ONLY_NOTES = new Set(['matches_admin', 'matches_removed_user', 'code_email_conflict']);

export interface ApprovalSelection {
  /** Duyệt mọi dòng chờ duyệt có `match_status` là `new` hoặc `exact`. */
  allValid?: boolean;
  /** Duyệt thêm các dòng này (dùng cho dòng `name_mismatch`: "đúng là người này"). */
  approveItemIds?: string[];
  rejectItemIds?: string[];
}

@Injectable()
export class AccountRequestsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Lưu file vào MediaStore, tạo yêu cầu `parsing` rồi xếp job phân tích (worker xử lý). */
  async create(actor: Actor, upload: { filename: string; content: Buffer; note: string | null }) {
    if (upload.content.length > MAX_UPLOAD_BYTES) throw validationFailed('file', 'file_too_large');
    if (!sniffUpload(upload.content)) throw validationFailed('file', 'unsupported_file');
    const note = trimmedNote(upload.note);
    const originalFilename = path.basename(upload.filename).slice(0, FILENAME_MAX) || 'danh-sach';

    const id = uuidv7();
    const uploadKey = `uploads/${id}`;
    await this.media.put(uploadKey, upload.content);
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(accountRequests).values({
          id,
          requestedBy: actor.id,
          note,
          originalFilename,
          uploadKey,
          status: 'parsing',
          // Giờ theo Clock (không phải giờ DB) để job dọn dẹp tính hạn 15 phút cho đúng.
          createdAt: this.clock.now(),
        });
        await this.audit.record(
          {
            actor,
            action: 'account-request.create',
            entityType: 'account_request',
            entityId: id,
            after: { originalFilename },
          },
          tx,
        );
      });
    } catch (error) {
      await this.media.delete(uploadKey);
      throw error;
    }
    try {
      await this.queue.enqueue('account-request.parse', { requestId: id });
    } catch (error) {
      // Không xếp được job (Redis hỏng): đừng để yêu cầu kẹt ở "đang đọc file" mãi mãi.
      await this.markParseFailed(id, uploadKey);
      throw error;
    }
    return { id, status: 'parsing' as const };
  }

  private async markParseFailed(id: string, uploadKey: string) {
    await this.db
      .update(accountRequests)
      .set({ status: 'parse_failed', parseError: 'internal_error', uploadKey: null })
      .where(eq(accountRequests.id, id));
    await this.media.delete(uploadKey);
  }

  async list(
    user: AuthenticatedUser,
    { page, pageSize, status }: Page & { status?: AccountRequestStatus },
  ) {
    const where = and(
      scopeOf(user) ? eq(accountRequests.requestedBy, user.id) : undefined,
      status ? eq(accountRequests.status, status) : undefined,
    );
    return paginate(
      { page, pageSize },
      () => this.db.select({ total: count() }).from(accountRequests).where(where),
      (limit, offset) =>
        this.db
          .select({
            id: accountRequests.id,
            status: accountRequests.status,
            parseError: accountRequests.parseError,
            originalFilename: accountRequests.originalFilename,
            rowCount: accountRequests.rowCount,
            requesterName: users.fullName,
            createdAt: accountRequests.createdAt,
            reviewedAt: accountRequests.reviewedAt,
          })
          .from(accountRequests)
          .innerJoin(users, eq(users.id, accountRequests.requestedBy))
          .where(where)
          .orderBy(desc(accountRequests.createdAt), desc(accountRequests.id))
          .limit(limit)
          .offset(offset),
    );
  }

  detail(user: AuthenticatedUser, id: string) {
    return this.loadDetail(id, scopeOf(user));
  }

  /** `onlyRequestedBy`: nếu có, chỉ thấy yêu cầu do người đó gửi. */
  private async loadDetail(id: string, onlyRequestedBy?: string) {
    const reviewer = alias(users, 'reviewer');
    const [request] = await this.db
      .select({
        id: accountRequests.id,
        status: accountRequests.status,
        parseError: accountRequests.parseError,
        note: accountRequests.note,
        originalFilename: accountRequests.originalFilename,
        rowCount: accountRequests.rowCount,
        requestedById: accountRequests.requestedBy,
        requesterName: users.fullName,
        createdAt: accountRequests.createdAt,
        reviewedAt: accountRequests.reviewedAt,
        reviewNote: accountRequests.reviewNote,
        reviewedByName: reviewer.fullName,
      })
      .from(accountRequests)
      .innerJoin(users, eq(users.id, accountRequests.requestedBy))
      .leftJoin(reviewer, eq(reviewer.id, accountRequests.reviewedBy))
      .where(this.visible(id, onlyRequestedBy));
    if (!request) throw new ApiError('NOT_FOUND');

    const grouped = await this.db
      .select({ matchStatus: accountRequestItems.matchStatus, total: count() })
      .from(accountRequestItems)
      .where(eq(accountRequestItems.requestId, id))
      .groupBy(accountRequestItems.matchStatus);
    const counts = { new: 0, exact: 0, name_mismatch: 0, blocked: 0 };
    for (const { matchStatus, total } of grouped) counts[matchStatus] = total;

    // Số dòng "duyệt cả lô" sẽ duyệt: còn chờ và là người mới hoặc khớp đúng tài khoản có sẵn.
    const [valid] = await this.db
      .select({ total: count() })
      .from(accountRequestItems)
      .where(
        and(
          eq(accountRequestItems.requestId, id),
          eq(accountRequestItems.outcome, 'pending'),
          inArray(accountRequestItems.matchStatus, ['new', 'exact']),
        ),
      );
    return { ...request, counts, pendingValid: valid?.total ?? 0 };
  }

  async items(
    user: AuthenticatedUser,
    id: string,
    { page, pageSize, matchStatus }: Page & { matchStatus?: MatchStatusValue },
  ) {
    const [visible] = await this.db
      .select({ id: accountRequests.id })
      .from(accountRequests)
      .where(this.visible(id, scopeOf(user)));
    if (!visible) throw new ApiError('NOT_FOUND');

    const where = and(
      eq(accountRequestItems.requestId, id),
      matchStatus ? eq(accountRequestItems.matchStatus, matchStatus) : undefined,
    );
    const result = await paginate(
      { page, pageSize },
      () => this.db.select({ total: count() }).from(accountRequestItems).where(where),
      (limit, offset) =>
        this.db
          .select({
            id: accountRequestItems.id,
            rowNumber: accountRequestItems.rowNumber,
            fullName: accountRequestItems.fullName,
            code: accountRequestItems.code,
            email: accountRequestItems.email,
            classLabel: accountRequestItems.classLabel,
            dateOfBirth: accountRequestItems.dateOfBirth,
            gender: accountRequestItems.gender,
            matchStatus: accountRequestItems.matchStatus,
            outcome: accountRequestItems.outcome,
            outcomeNote: accountRequestItems.outcomeNote,
            matchedUserId: users.id,
            matchedUserName: users.fullName,
          })
          .from(accountRequestItems)
          .leftJoin(users, eq(users.id, accountRequestItems.userId))
          .where(where)
          .orderBy(accountRequestItems.rowNumber)
          .limit(limit)
          .offset(offset),
    );
    // Người ra đề không thấy tên tài khoản bị khớp hay lý do chặn cụ thể: tránh dùng tính năng này để dò danh bạ.
    return {
      ...result,
      items: result.items.map(({ matchedUserId, matchedUserName, ...item }) => ({
        ...item,
        outcomeNote:
          !user.isAdmin && item.outcomeNote && ADMIN_ONLY_NOTES.has(item.outcomeNote)
            ? 'account_conflict'
            : item.outcomeNote,
        matchedUser:
          user.isAdmin && matchedUserId ? { id: matchedUserId, fullName: matchedUserName } : null,
      })),
    };
  }

  /**
   * Quản trị viên duyệt một đợt (Q91): từ chối các dòng chọn từ chối ngay, còn các dòng duyệt thì chuyển sang
   * `approving` và giao worker tạo tài khoản. Chỉ từ chối thì xong luôn, không cần worker.
   */
  async approve(actor: Actor, id: string, selection: ApprovalSelection) {
    const plan = await this.db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(accountRequests)
        .where(eq(accountRequests.id, id))
        .for('update');
      if (!request) throw new ApiError('NOT_FOUND');
      if (request.status !== 'pending') throw new ApiError('INVALID_STATE');

      const pending = await tx
        .select({ id: accountRequestItems.id, matchStatus: accountRequestItems.matchStatus })
        .from(accountRequestItems)
        .where(
          and(eq(accountRequestItems.requestId, id), eq(accountRequestItems.outcome, 'pending')),
        );
      const byId = new Map(pending.map((item) => [item.id, item]));

      const approve = new Set<string>();
      if (selection.allValid) {
        for (const item of pending) {
          if (item.matchStatus === 'new' || item.matchStatus === 'exact') approve.add(item.id);
        }
      }
      for (const itemId of selection.approveItemIds ?? []) {
        const item = byId.get(itemId);
        if (!item || item.matchStatus === 'blocked') {
          throw validationFailed('approveItemIds', 'item_not_approvable');
        }
        approve.add(itemId);
      }
      const reject = new Set(selection.rejectItemIds ?? []);
      for (const itemId of reject) {
        if (!byId.has(itemId) || approve.has(itemId)) {
          throw validationFailed('rejectItemIds', 'item_not_rejectable');
        }
      }
      if (approve.size === 0 && reject.size === 0) {
        throw validationFailed('approveItemIds', 'nothing_selected');
      }

      if (reject.size > 0) {
        await tx
          .update(accountRequestItems)
          .set({ outcome: 'rejected', outcomeNote: 'rejected_by_admin' })
          .where(inArray(accountRequestItems.id, [...reject]));
      }
      if (approve.size > 0) {
        await tx
          .update(accountRequests)
          .set({ status: 'approving' })
          .where(eq(accountRequests.id, id));
      } else {
        const status = await settleRequest(tx, id, actor.id, this.clock.now());
        await this.audit.record(
          {
            actor,
            action: 'account-request.approve',
            entityType: 'account_request',
            entityId: id,
            after: { approved: 0, created: 0, tagAdded: 0, skipped: 0, rejected: reject.size },
          },
          tx,
        );
        if (status !== 'pending') {
          await this.notifications.notify(
            {
              userIds: [request.requestedBy],
              type: 'account_request.reviewed',
              data: { requestId: id, status },
            },
            tx,
          );
        }
      }
      return { itemIds: [...approve], rejectedCount: reject.size };
    });

    if (plan.itemIds.length > 0) {
      try {
        await this.queue.enqueue('account-request.approve', {
          requestId: id,
          itemIds: plan.itemIds,
          reviewerId: actor.id,
          reviewerIp: actor.ip,
          rejectedCount: plan.rejectedCount,
        });
      } catch (error) {
        // Không xếp được job: đưa yêu cầu về "chờ duyệt" để Quản trị viên bấm lại, đừng để kẹt ở "đang tạo".
        await this.db
          .update(accountRequests)
          .set({ status: 'pending' })
          .where(and(eq(accountRequests.id, id), eq(accountRequests.status, 'approving')));
        throw error;
      }
    }
    return this.loadDetail(id);
  }

  /** Quản trị viên Từ chối cả yêu cầu đang chờ duyệt. */
  async reject(actor: Actor, id: string, note: string | null) {
    const reviewNote = trimmedNote(note);
    await this.db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(accountRequests)
        .where(eq(accountRequests.id, id))
        .for('update');
      if (!request) throw new ApiError('NOT_FOUND');
      if (request.status !== 'pending') throw new ApiError('INVALID_STATE');

      const now = this.clock.now();
      await tx
        .update(accountRequestItems)
        .set({ outcome: 'rejected', outcomeNote: 'request_rejected' })
        .where(
          and(eq(accountRequestItems.requestId, id), eq(accountRequestItems.outcome, 'pending')),
        );
      await tx
        .update(accountRequests)
        .set({ status: 'rejected', reviewedBy: actor.id, reviewedAt: now, reviewNote })
        .where(eq(accountRequests.id, id));
      await this.audit.record(
        {
          actor,
          action: 'account-request.reject',
          entityType: 'account_request',
          entityId: id,
          before: { status: 'pending' },
          after: { status: 'rejected', reviewNote },
        },
        tx,
      );
      await this.notifications.notify(
        {
          userIds: [request.requestedBy],
          type: 'account_request.reviewed',
          data: { requestId: id, status: 'rejected' },
        },
        tx,
      );
    });
    return this.loadDetail(id);
  }

  /** Dòng điều kiện "yêu cầu này, và người xem được phép thấy". */
  private visible(id: string, onlyRequestedBy?: string): SQL | undefined {
    return and(
      eq(accountRequests.id, id),
      onlyRequestedBy ? eq(accountRequests.requestedBy, onlyRequestedBy) : undefined,
    );
  }
}
