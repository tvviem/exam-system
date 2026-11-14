import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { Actor } from '../../../common/actor';
import { ApiError, validationFailed } from '../../../common/api-error';
import { CLOCK, type Clock } from '../../../common/clock';
import { LIVE_SESSION_GUARD, type LiveSessionGuard } from '../../../common/live-session-guard';
import {
  OWNED_CONTENT,
  type OwnedContent,
  type OwnedCounts,
  type PreparedTransfer,
} from '../../../common/owned-content';
import { type Page, paginate } from '../../../common/pagination';
import { mapUniqueToConflict } from '../../../common/pg-error';
import {
  USER_DEACTIVATION_HOOKS,
  type UserDeactivationHooks,
} from '../../../common/user-deactivation';
import { type Database, DB, type Transaction as Tx } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import { MailService } from '../../mail/mail.service';
import { NotificationsService } from '../../notifications/notifications.service';
import type { RoleTag } from '../auth/auth.types';
import { type AuthSessionRevokeReason, AuthSessionStore } from '../auth/auth-session-store';
import { LoginBlock } from '../auth/login-block';
import { examinerProfiles, units, userRoleTags, users } from '../identity.schema';
import { hashPassword } from '../password/password-hasher';
import {
  generateTemporaryPassword,
  TEMPORARY_PASSWORD_TTL_MS,
} from '../password/temporary-password';
import { type UserRow, UsersRepository } from '../users.repository';

export const USER_STATUSES = ['active', 'locked', 'removed'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Bộ lọc kích hoạt (7d-1): chưa kích hoạt, email chưa xác thực, thư gần nhất bị từ chối hoặc lỗi. */
export const ACTIVATION_FILTERS = ['pending', 'unverified', 'mail_failed'] as const;
export type ActivationFilter = (typeof ACTIVATION_FILTERS)[number];

export interface UserFilter {
  q?: string;
  status?: UserStatus;
  roleTag?: RoleTag;
  activation?: ActivationFilter;
}

type ExaminerProfileRow = typeof examinerProfiles.$inferSelect;
/** Kết nối thường hoặc transaction đang mở. */
type Executor = Pick<Database, 'select'>;

export interface UserUpdate {
  fullName?: string;
  username?: string | null;
  code?: string | null;
  classLabel?: string | null;
  dateOfBirth?: string | null;
  gender?: UserRow['gender'];
  examinerProfile?: Partial<
    Pick<ExaminerProfileRow, 'academicDegree' | 'academicTitle' | 'unitId'>
  >;
}

// Q65: tài khoản Quản trị viên chỉ có thông tin đăng nhập và họ tên.
const ADMIN_EDITABLE = new Set<keyof UserUpdate>(['fullName', 'username']);

const UNIQUE_FIELDS: Record<string, string> = {
  users_username_active_key: 'username',
  users_email_active_key: 'email',
  users_code_active_key: 'code',
};

/** `409 HAS_CONTENT`: người này còn Chủ đề, Bộ đề hay Phiên thi, Quản trị viên phải chọn người nhận (Q150, Q263). */
const hasContent = (
  topics: { id: string; name: string; questionCount: number }[],
  exams = 0,
  sessions = 0,
) =>
  new ApiError('HAS_CONTENT', {
    topics: topics.map(({ id, name, questionCount }) => ({ id, name, questionCount })),
    exams,
    sessions,
  });

const isUniqueViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === '23505';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Móc để bên khác (Người ra đề cấp lại cho Người dự thi trong Danh sách) đặt điều kiện và việc đi kèm trong cùng giao dịch. */
export interface ReissueHooks {
  /** Ghi thêm vào nhật ký thao tác (ví dụ Phiên thi nào, do Người ra đề cấp). */
  auditContext?: Record<string, unknown>;
  guard?(tx: Tx, target: UserRow): Promise<void>;
  onApplied?(tx: Tx): Promise<void>;
}

/** Quản lý Người dùng của Quản trị viên (PR 1b). */
@Injectable()
export class UserManagementService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly authSessions: AuthSessionStore,
    private readonly loginBlock: LoginBlock,
    private readonly usersRepository: UsersRepository,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    @Inject(OWNED_CONTENT) private readonly ownedContent: OwnedContent,
    @Inject(USER_DEACTIVATION_HOOKS) private readonly deactivation: UserDeactivationHooks,
    @Inject(LIVE_SESSION_GUARD) private readonly liveGuard: LiveSessionGuard,
  ) {}

  async list({ page, pageSize, ...filter }: Page & UserFilter) {
    const where = this.listCondition(filter);
    const result = await paginate(
      { page, pageSize },
      () => this.db.select({ total: count() }).from(users).where(where),
      (limit, offset) =>
        this.db
          .select()
          .from(users)
          .where(where)
          .orderBy(desc(users.createdAt), desc(users.id))
          .limit(limit)
          .offset(offset),
    );
    const tags = await this.roleTagsOf(result.items.map((r) => r.id));
    return {
      ...result,
      items: result.items.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        username: r.username,
        email: r.email,
        code: r.code,
        classLabel: r.classLabel,
        isAdmin: r.isAdmin,
        roleTags: tags.get(r.id) ?? [],
        status: statusOf(r),
        pending: r.passwordHash === null,
        emailVerified: r.emailVerifiedAt !== null,
        lastLoginAt: r.lastLoginAt,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Chi tiết một Người dùng; ngày sinh và giới tính chỉ trả cho Quản trị viên (Nghị định 13/2023). */
  async detail(id: string) {
    const user = await this.findOrThrow(id);
    const roleTags = (await this.roleTagsOf([id])).get(id) ?? [];
    const [profile] = await this.db
      .select({
        academicDegree: examinerProfiles.academicDegree,
        academicTitle: examinerProfiles.academicTitle,
        unitId: examinerProfiles.unitId,
        unitName: units.name,
      })
      .from(examinerProfiles)
      .leftJoin(units, eq(units.id, examinerProfiles.unitId))
      .where(eq(examinerProfiles.userId, id));
    // Cảnh báo "Đang trong Phiên thi X" và vô hiệu nút Khóa, Xóa ở trang chi tiết (Q264).
    const liveSessions = user.removedAt ? [] : await this.liveSessionsOf(this.db, id);
    return {
      liveSessions,
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      code: user.code,
      classLabel: user.classLabel,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      isAdmin: user.isAdmin,
      roleTags,
      status: statusOf(user),
      lockedAt: user.lockedAt,
      lockedReason: user.lockedReason,
      removedAt: user.removedAt,
      mustChangePassword: user.mustChangePassword,
      passwordExpiresAt: user.passwordExpiresAt,
      pending: user.passwordHash === null,
      emailVerified: user.emailVerifiedAt !== null,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      examinerProfile: profile ?? null,
    };
  }

  async update(actor: Actor, id: string, input: UserUpdate): Promise<void> {
    const { examinerProfile, ...fields } = input;
    await mapUniqueToConflict(UNIQUE_FIELDS, () =>
      this.db.transaction(async (tx) => {
        // Khóa dòng để `before` trong nhật ký đúng với giá trị bị ghi đè khi hai người cùng sửa.
        const user = await this.lockRowOrThrow(tx, id);
        if (user.removedAt) throw new ApiError('INVALID_STATE');
        if (user.isAdmin) {
          const notAllowed = (Object.keys(input) as (keyof UserUpdate)[]).find(
            (k) => !ADMIN_EDITABLE.has(k),
          );
          if (notAllowed) throw validationFailed(notAllowed, 'not_allowed_for_admin');
        }
        const username = input.username === undefined ? user.username : input.username;
        // Email không đổi ở đây: dùng "Sửa email" của hỗ trợ kích hoạt (có lý do, xác thực lại, nhật ký riêng).
        if (!username && !user.email)
          throw validationFailed('username', 'username_or_email_required');
        if (examinerProfile) {
          await this.assertCanHaveExaminerProfile(tx, id, examinerProfile.unitId);
        }

        // Q68: nhật ký chỉ ghi các trường thật sự thay đổi.
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields) as [keyof typeof fields, unknown][]) {
          if (user[key] !== value) {
            before[key] = user[key];
            after[key] = value;
          }
        }
        if (examinerProfile) {
          const old = await this.profileOf(tx, id);
          for (const [key, value] of Object.entries(examinerProfile) as [
            keyof typeof examinerProfile,
            unknown,
          ][]) {
            if ((old?.[key] ?? null) !== value) {
              before[`examinerProfile.${key}`] = old?.[key] ?? null;
              after[`examinerProfile.${key}`] = value;
            }
          }
        }
        if (Object.keys(after).length === 0) return;

        if (Object.keys(fields).length > 0) {
          await tx.update(users).set(fields).where(eq(users.id, id));
        }
        if (examinerProfile) {
          await tx
            .insert(examinerProfiles)
            .values({ userId: id, ...examinerProfile })
            .onConflictDoUpdate({ target: examinerProfiles.userId, set: examinerProfile });
        }
        await this.audit.record(
          { actor, action: 'user.update', entityType: 'user', entityId: id, before, after },
          tx,
        );
      }),
    );
  }

  /** Khóa đăng nhập: bắt buộc lý do, thu hồi mọi Phiên đăng nhập. */
  async lock(actor: Actor, id: string, reason: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const user = await this.lockTargetOrThrow(tx, actor, id);
      if (user.status === 'locked') throw new ApiError('INVALID_STATE');
      await this.assertNotInLiveSession(tx, id);
      await tx
        .update(users)
        .set({
          status: 'locked',
          lockedAt: this.clock.now(),
          lockedBy: actor.id,
          lockedReason: reason,
        })
        .where(eq(users.id, id));
      await this.audit.record(
        {
          actor,
          action: 'user.lock',
          entityType: 'user',
          entityId: id,
          before: { status: user.status, lockedReason: user.lockedReason },
          after: { status: 'locked', lockedReason: reason },
        },
        tx,
      );
      await this.deactivation.onDeactivated(tx, id);
      await this.revokeBeforeCommit(id, 'user_locked');
    });
  }

  /** Mở Khóa đăng nhập; lý do không bắt buộc (Q63). */
  async unlock(actor: Actor, id: string, reason: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      const user = await this.lockTargetOrThrow(tx, actor, id);
      if (user.status !== 'locked') throw new ApiError('INVALID_STATE');
      await tx
        .update(users)
        .set({ status: 'active', lockedAt: null, lockedBy: null, lockedReason: null })
        .where(eq(users.id, id));
      await this.audit.record(
        {
          actor,
          action: 'user.unlock',
          entityType: 'user',
          entityId: id,
          before: { status: 'locked', lockedReason: user.lockedReason },
          // Lý do mở khóa không lưu ở bảng users nên chỉ có trong nhật ký.
          after: {
            status: 'active',
            lockedReason: null,
            ...(reason ? { unlockReason: reason } : {}),
          },
        },
        tx,
      );
    });
  }

  /** Chủ đề của một người dùng (kể cả đã bị Xóa) để Quản trị viên chọn Chuyển giao (Q148). */
  async contentOf(id: string, topicIds?: string[], recipientId?: string) {
    await this.findOrThrow(id);
    return this.ownedContent.summaryOf(id, { topicIds, recipientId });
  }

  /**
   * Chuyển giao Chủ đề của một người dùng cho Người ra đề khác (Q148, Q149). Cho phép cả khi người cho đã bị Xóa
   * (Chủ đề còn sót lại dưới tài khoản đã Xóa). Phần sao chép file ảnh làm trước giao dịch.
   */
  async transfer(
    actor: Actor,
    id: string,
    input: { topicIds: string[]; recipientId: string },
  ): Promise<OwnedCounts> {
    const donor = await this.findOrThrow(id);
    await this.assertRecipient(this.db, id, input.recipientId);
    const prepared = await this.ownedContent.prepareTransfer({
      fromId: id,
      toId: input.recipientId,
      topicIds: input.topicIds,
    });
    return this.runPrepared(prepared, async (tx) => {
      const locked = await this.lockUsersInOrder(tx, [id, input.recipientId]);
      await this.assertRecipient(tx, id, input.recipientId, locked.get(input.recipientId));
      return this.applyTransfer(tx, actor, donor, input.recipientId, prepared);
    });
  }

  /**
   * Xóa người dùng (soft-delete), thu hồi mọi Phiên đăng nhập. Còn Chủ đề mà không nêu người nhận thì `HAS_CONTENT`;
   * nêu `recipientId` thì Chuyển giao toàn bộ rồi Xóa trong cùng một giao dịch (Q150).
   */
  async remove(actor: Actor, id: string, recipientId?: string): Promise<void> {
    // Kiểm tra trạng thái trước khi tốn công xem nội dung hay chép file ảnh.
    if (actor.id === id) throw new ApiError('CANNOT_TARGET_SELF');
    this.assertTarget(actor, await this.findOrThrow(id));
    await this.assertNotInLiveSession(this.db, id);
    const { topics, totals } = await this.ownedContent.summaryOf(id);
    // Bộ đề và Phiên thi cũng là nội dung (Q183, Q263): người chỉ có Bộ đề rỗng hay Phiên thi vẫn phải chọn người nhận.
    if (totals.topics === 0 && totals.exams === 0 && totals.sessions === 0) {
      return this.removeWithoutContent(actor, id);
    }
    if (!recipientId) throw hasContent(topics, totals.exams, totals.sessions);

    await this.assertRecipient(this.db, id, recipientId);
    const prepared = await this.ownedContent.prepareTransfer({
      fromId: id,
      toId: recipientId,
      topicIds: 'all',
    });
    await this.runPrepared(prepared, async (tx) => {
      const locked = await this.lockUsersInOrder(tx, [id, recipientId]);
      const donor = locked.get(id);
      if (!donor) throw new ApiError('NOT_FOUND');
      this.assertTarget(actor, donor);
      await this.assertNotInLiveSession(tx, id);
      await this.assertRecipient(tx, id, recipientId, locked.get(recipientId));
      await this.applyTransfer(tx, actor, donor, recipientId, prepared);
      await this.softDelete(tx, actor, id);
    });
  }

  private async removeWithoutContent(actor: Actor, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockTargetOrThrow(tx, actor, id);
      await this.assertNotInLiveSession(tx, id);
      // Chủ đề có thể vừa được tạo giữa lúc kiểm tra và lúc khóa dòng.
      const { topics, totals } = await this.ownedContent.summaryOf(id);
      if (totals.topics > 0 || totals.exams > 0 || totals.sessions > 0) {
        throw hasContent(topics, totals.exams, totals.sessions);
      }
      await this.softDelete(tx, actor, id);
    });
  }

  private async softDelete(tx: Tx, actor: Actor, id: string): Promise<void> {
    const removedAt = this.clock.now();
    await tx.update(users).set({ removedAt, removedBy: actor.id }).where(eq(users.id, id));
    await this.audit.record(
      {
        actor,
        action: 'user.remove',
        entityType: 'user',
        entityId: id,
        before: { removedAt: null },
        after: { removedAt },
      },
      tx,
    );
    await this.deactivation.onDeactivated(tx, id);
    await this.revokeBeforeCommit(id, 'user_removed');
  }

  /** Ghi nhật ký `topic.transfer` và báo cho người nhận (Q148, Q151). */
  private async applyTransfer(
    tx: Tx,
    actor: Actor,
    donor: UserRow,
    recipientId: string,
    prepared: PreparedTransfer,
  ): Promise<OwnedCounts> {
    const counts = await prepared.apply(tx, donor.fullName);
    if (counts.topics > 0 || counts.exams > 0) {
      await this.audit.record(
        {
          actor,
          action: 'topic.transfer',
          entityType: 'user',
          entityId: donor.id,
          after: { from: donor.id, to: recipientId, ...counts },
        },
        tx,
      );
      await this.notifications.notify(
        {
          userIds: [recipientId],
          type: 'topics.transferred',
          data: { topics: counts.topics, exams: counts.exams },
        },
        tx,
      );
    }
    if (counts.sessions > 0) {
      // Phiên thi nhận qua Xóa người dùng (Q263): nhật ký và thông báo riêng để người nhận biết mình có thêm Phiên thi.
      await this.audit.record(
        {
          actor,
          action: 'session.transfer',
          entityType: 'user',
          entityId: donor.id,
          after: { from: donor.id, to: recipientId, sessions: counts.sessions },
        },
        tx,
      );
      await this.notifications.notify(
        {
          userIds: [recipientId],
          type: 'sessions.transferred',
          data: { sessions: counts.sessions },
        },
        tx,
      );
    }
    return counts;
  }

  /** Chạy phần trong giao dịch của một lần Chuyển giao đã chuẩn bị, rồi dọn file thừa dù thành công hay không. */
  private async runPrepared<T>(
    prepared: PreparedTransfer,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    let result: T;
    try {
      result = await this.db.transaction(work);
    } catch (error) {
      await prepared.finish(false);
      // Người nhận vừa tạo Chủ đề trùng tên hoặc tải cùng một ảnh đúng lúc này: bảo thử lại thay vì trả lỗi 500.
      if (isUniqueViolation(error)) throw new ApiError('CONFLICT', { reason: 'CONTENT_CHANGED' });
      throw error;
    }
    await prepared.finish(true);
    return result;
  }

  /** Người nhận: Nhãn Người ra đề, không phải Quản trị viên, chưa Khóa, chưa Xóa, khác người cho (Q148). */
  private async assertRecipient(
    db: Executor,
    donorId: string,
    recipientId: string,
    locked?: UserRow,
  ): Promise<void> {
    const user = locked ?? (await this.usersRepository.findById(recipientId));
    const [examiner] = user
      ? await db
          .select({ tag: userRoleTags.tag })
          .from(userRoleTags)
          .where(and(eq(userRoleTags.userId, recipientId), eq(userRoleTags.tag, 'examiner')))
      : [];
    if (
      !user ||
      !examiner ||
      user.id === donorId ||
      user.isAdmin ||
      user.removedAt ||
      user.status !== 'active'
    ) {
      throw validationFailed('recipientId', 'invalid_recipient');
    }
  }

  /** Phiên thi đang diễn ra mà người này là chủ hoặc đang làm bài, kèm tên chủ để Quản trị viên biết hỏi ai (Q264). */
  private async liveSessionsOf(db: Executor, userId: string) {
    const sessions = await this.liveGuard.liveSessionsOf(userId, db);
    if (sessions.length === 0) return [];
    const owners = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, [...new Set(sessions.map((s) => s.ownerId))]));
    const names = new Map(owners.map((o) => [o.id, o.fullName]));
    return sessions.map((s) => ({ ...s, ownerName: names.get(s.ownerId) ?? null }));
  }

  /** `409 USER_IN_LIVE_SESSION` (Q264): không Khóa hay Xóa người đang trong Phiên thi đang diễn ra, không có lối tắt ở MVP. */
  private async assertNotInLiveSession(db: Executor, userId: string): Promise<void> {
    const sessions = await this.liveSessionsOf(db, userId);
    if (sessions.length > 0) throw new ApiError('USER_IN_LIVE_SESSION', { sessions });
  }

  /** Khóa dòng nhiều người dùng theo thứ tự `id`, để hai Chuyển giao ngược chiều không bế tắc nhau. */
  private async lockUsersInOrder(tx: Tx, ids: string[]): Promise<Map<string, UserRow>> {
    const rows = await tx
      .select()
      .from(users)
      .where(inArray(users.id, ids))
      .orderBy(asc(users.id))
      .for('update');
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** Gắn Nhãn vai trò; gắn `examiner` thì tạo hồ sơ Người ra đề trống nếu chưa có (Q64). */
  async grantRoleTag(actor: Actor, id: string, tag: RoleTag): Promise<void> {
    const user = await this.findTaggableOrThrow(id);
    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(userRoleTags)
        .values({ userId: user.id, tag, grantedBy: actor.id, grantedAt: this.clock.now() })
        .onConflictDoNothing()
        .returning({ tag: userRoleTags.tag });
      if (inserted.length === 0) return;
      if (tag === 'examiner') {
        await tx.insert(examinerProfiles).values({ userId: user.id }).onConflictDoNothing();
      }
      await this.audit.record(
        { actor, action: 'user.role-tag.grant', entityType: 'user', entityId: id, after: { tag } },
        tx,
      );
    });
  }

  /** Gỡ Nhãn vai trò; hồ sơ Người ra đề được giữ lại (Q64). */
  async revokeRoleTag(actor: Actor, id: string, tag: RoleTag): Promise<void> {
    await this.findTaggableOrThrow(id);
    await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(userRoleTags)
        .where(and(eq(userRoleTags.userId, id), eq(userRoleTags.tag, tag)))
        .returning({ tag: userRoleTags.tag });
      if (deleted.length === 0) return;
      await this.audit.record(
        {
          actor,
          action: 'user.role-tag.revoke',
          entityType: 'user',
          entityId: id,
          before: { tag },
        },
        tx,
      );
    });
  }

  /**
   * Cấp lại mật khẩu tạm (Q61): hạn 7 ngày, buộc đổi khi đăng nhập, thu hồi mọi phiên và gỡ khóa tạm.
   * Không mở Khóa đăng nhập. Mật khẩu chỉ trả về một lần, không ghi vào DB hay nhật ký.
   */
  async reissueTemporaryPassword(actor: Actor, id: string, hooks: ReissueHooks = {}) {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const passwordExpiresAt = new Date(this.clock.now().getTime() + TEMPORARY_PASSWORD_TTL_MS);
    await this.db.transaction(async (tx) => {
      const target = await this.lockTargetOrThrow(tx, actor, id);
      // Kiểm điều kiện sau khi đã khóa dòng: người dùng vừa đổi mật khẩu thì không bị đè (cấp lại cho người khác).
      await hooks.guard?.(tx, target);
      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: true, passwordExpiresAt })
        .where(eq(users.id, id));
      await this.audit.record(
        {
          actor,
          action: 'user.temporary-password.reissue',
          entityType: 'user',
          entityId: id,
          after: { passwordExpiresAt, ...hooks.auditContext },
        },
        tx,
      );
      await hooks.onApplied?.(tx);
      await this.revokeBeforeCommit(id, 'password_reissued');
    });
    await this.loginBlock.clear(id);
    return { temporaryPassword, passwordExpiresAt };
  }

  /** Chỉ định Quản trị viên = tạo tài khoản Quản trị viên riêng, không mang Nhãn vai trò (Q23, Q70). */
  /**
   * Tạo Quản trị viên bằng EMAIL (ADR-0009): tài khoản Chờ kích hoạt (không mật khẩu) và một thư kích hoạt làn khẩn, cùng
   * một giao dịch. Người đó tự đặt mật khẩu bằng liên kết trong thư; không ai khác biết mật khẩu. Tên đăng nhập mặc
   * định là email.
   */
  async createAdmin(
    actor: Actor,
    input: { username?: string; email: string; fullName: string },
  ): Promise<{ id: string; username: string }> {
    const username = input.username ?? input.email;
    const created = await mapUniqueToConflict(UNIQUE_FIELDS, () =>
      this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(users)
          .values({
            username,
            email: input.email,
            fullName: input.fullName,
            isAdmin: true,
            createdBy: actor.id,
          })
          .returning({ id: users.id });
        if (!row) throw new Error('Không tạo được Quản trị viên');
        await this.mail.enqueueIn(tx, [
          {
            kind: 'activation',
            toEmail: input.email,
            lane: 'urgent',
            userId: row.id,
            requestedBy: actor.id,
          },
        ]);
        await this.audit.record(
          {
            actor,
            action: 'admin.create',
            entityType: 'user',
            entityId: row.id,
            after: { username, email: input.email, fullName: input.fullName },
          },
          tx,
        );
        return row;
      }),
    );
    await this.mail.wake();
    return { id: created.id, username };
  }

  /** Người dùng chưa bị Xóa và không phải Quản trị viên. */
  private async findTaggableOrThrow(id: string): Promise<UserRow> {
    const user = await this.findOrThrow(id);
    if (user.removedAt || user.isAdmin) throw new ApiError('INVALID_STATE');
    return user;
  }

  /** Khóa dòng Người dùng tới hết transaction; người đó chưa bị Xóa và không phải chính người thực hiện. */
  private async lockTargetOrThrow(tx: Tx, actor: Actor, id: string): Promise<UserRow> {
    if (actor.id === id) throw new ApiError('CANNOT_TARGET_SELF');
    const user = await this.lockRowOrThrow(tx, id);
    this.assertTarget(actor, user);
    return user;
  }

  private assertTarget(actor: Actor, user: UserRow): void {
    if (actor.id === user.id) throw new ApiError('CANNOT_TARGET_SELF');
    if (user.removedAt) throw new ApiError('INVALID_STATE');
  }

  private async lockRowOrThrow(tx: Tx, id: string): Promise<UserRow> {
    const [user] = await tx.select().from(users).where(eq(users.id, id)).for('update');
    if (!user) throw new ApiError('NOT_FOUND');
    return user;
  }

  /**
   * Gọi ở cuối transaction: Redis lỗi thì transaction rollback và API báo lỗi, không có chuyện thay đổi
   * đã lưu mà phiên cũ vẫn sống. Commit lỗi sau khi đã thu hồi thì chỉ là đăng xuất thừa, vẫn an toàn.
   */
  private revokeBeforeCommit(userId: string, reason: AuthSessionRevokeReason) {
    return this.authSessions.revokeAllForUser(userId, reason);
  }

  private async assertCanHaveExaminerProfile(
    db: Executor,
    userId: string,
    unitId: string | null | undefined,
  ) {
    const tags = (await this.roleTagsOf([userId], db)).get(userId) ?? [];
    if (!tags.includes('examiner')) {
      throw validationFailed('examinerProfile', 'requires_examiner_tag');
    }
    if (unitId) {
      const [unit] = await db.select({ id: units.id }).from(units).where(eq(units.id, unitId));
      if (!unit) throw validationFailed('examinerProfile.unitId', 'unit_not_found');
    }
  }

  private async profileOf(db: Executor, userId: string): Promise<ExaminerProfileRow | undefined> {
    const [row] = await db
      .select()
      .from(examinerProfiles)
      .where(eq(examinerProfiles.userId, userId));
    return row;
  }

  private async findOrThrow(id: string): Promise<UserRow> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new ApiError('NOT_FOUND');
    return user;
  }

  /** Mặc định ẩn người đã bị Xóa (Q66). Từ khóa so khớp không dấu, không phân biệt hoa thường (Q69). */
  private listCondition({ q, status, roleTag, activation }: UserFilter): SQL | undefined {
    const conditions: (SQL | undefined)[] = [
      status === 'removed' ? isNotNull(users.removedAt) : isNull(users.removedAt),
    ];
    if (status === 'active' || status === 'locked') conditions.push(eq(users.status, status));
    if (roleTag) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(userRoleTags)
            .where(and(eq(userRoleTags.userId, users.id), eq(userRoleTags.tag, roleTag))),
        ),
      );
    }
    // Quy tắc trạng thái: chưa có mật khẩu là Chờ kích hoạt.
    if (activation === 'pending') conditions.push(isNull(users.passwordHash));
    if (activation === 'unverified') {
      conditions.push(isNotNull(users.passwordHash), isNull(users.emailVerifiedAt));
    }
    if (activation === 'mail_failed') {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM email_outbox o
           WHERE o.user_id = ${users.id}
             AND o.status IN ('rejected', 'failed')
             AND o.created_at = (SELECT max(created_at) FROM email_outbox WHERE user_id = ${users.id})
        )`,
      );
    }
    if (q) {
      const pattern = `%${escapeLike(q)}%`;
      conditions.push(
        or(
          ...[users.fullName, users.username, users.email, users.code, users.classLabel].map(
            (column) => sql`unaccent(coalesce(${column}::text, '')) ILIKE unaccent(${pattern})`,
          ),
        ),
      );
    }
    return and(...conditions);
  }

  private async roleTagsOf(
    userIds: string[],
    db: Executor = this.db,
  ): Promise<Map<string, RoleTag[]>> {
    const result = new Map<string, RoleTag[]>();
    if (userIds.length === 0) return result;
    const rows = await db
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
