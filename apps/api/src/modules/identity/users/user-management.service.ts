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
import {
  OWNED_CONTENT,
  type OwnedContent,
  type OwnedCounts,
  type PreparedTransfer,
} from '../../../common/owned-content';
import { type Page, paginate } from '../../../common/pagination';
import { mapUniqueToConflict } from '../../../common/pg-error';
import { type Database, DB, type Transaction as Tx } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
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

export interface UserFilter {
  q?: string;
  status?: UserStatus;
  roleTag?: RoleTag;
}

type ExaminerProfileRow = typeof examinerProfiles.$inferSelect;
/** Kết nối thường hoặc transaction đang mở. */
type Executor = Pick<Database, 'select'>;

export interface UserUpdate {
  fullName?: string;
  username?: string | null;
  email?: string | null;
  code?: string | null;
  classLabel?: string | null;
  dateOfBirth?: string | null;
  gender?: UserRow['gender'];
  examinerProfile?: Partial<
    Pick<ExaminerProfileRow, 'academicDegree' | 'academicTitle' | 'unitId'>
  >;
}

// Q65: tài khoản Quản trị viên chỉ có thông tin đăng nhập và họ tên.
const ADMIN_EDITABLE = new Set<keyof UserUpdate>(['fullName', 'username', 'email']);

const UNIQUE_FIELDS: Record<string, string> = {
  users_username_active_key: 'username',
  users_email_active_key: 'email',
  users_code_active_key: 'code',
};

/** `409 HAS_CONTENT`: người này còn Chủ đề, Quản trị viên phải chọn người nhận (Q150). */
const hasContent = (topics: { id: string; name: string; questionCount: number }[], exams = 0) =>
  new ApiError('HAS_CONTENT', {
    topics: topics.map(({ id, name, questionCount }) => ({ id, name, questionCount })),
    exams,
  });

const isUniqueViolation = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code === '23505';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

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
    @Inject(OWNED_CONTENT) private readonly ownedContent: OwnedContent,
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
    return {
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
        const email = input.email === undefined ? user.email : input.email;
        if (!username && !email) throw validationFailed('username', 'username_or_email_required');
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
  async contentOf(id: string, topicIds?: string[]) {
    await this.findOrThrow(id);
    return this.ownedContent.summaryOf(id, { topicIds });
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
    const { topics, totals } = await this.ownedContent.summaryOf(id);
    // Bộ đề cũng là nội dung (Q183): người chỉ có Bộ đề rỗng, chưa có Chủ đề nào, vẫn phải chọn người nhận.
    if (totals.topics === 0 && totals.exams === 0) return this.removeWithoutContent(actor, id);
    if (!recipientId) throw hasContent(topics, totals.exams);

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
      await this.assertRecipient(tx, id, recipientId, locked.get(recipientId));
      await this.applyTransfer(tx, actor, donor, recipientId, prepared);
      await this.softDelete(tx, actor, id);
    });
  }

  private async removeWithoutContent(actor: Actor, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockTargetOrThrow(tx, actor, id);
      // Chủ đề có thể vừa được tạo giữa lúc kiểm tra và lúc khóa dòng.
      const { topics, totals } = await this.ownedContent.summaryOf(id);
      if (totals.topics > 0 || totals.exams > 0) throw hasContent(topics, totals.exams);
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
    if (counts.topics === 0 && counts.exams === 0) return counts;
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
  async reissueTemporaryPassword(actor: Actor, id: string) {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const passwordExpiresAt = new Date(this.clock.now().getTime() + TEMPORARY_PASSWORD_TTL_MS);
    await this.db.transaction(async (tx) => {
      await this.lockTargetOrThrow(tx, actor, id);
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
          after: { passwordExpiresAt },
        },
        tx,
      );
      await this.revokeBeforeCommit(id, 'password_reissued');
    });
    await this.loginBlock.clear(id);
    return { temporaryPassword, passwordExpiresAt };
  }

  /** Chỉ định Quản trị viên = tạo tài khoản Quản trị viên riêng, không mang Nhãn vai trò (Q23, Q70). */
  async createAdmin(
    actor: Actor,
    input: { username: string; email: string | null; fullName: string },
  ) {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const passwordExpiresAt = new Date(this.clock.now().getTime() + TEMPORARY_PASSWORD_TTL_MS);
    const created = await mapUniqueToConflict(UNIQUE_FIELDS, () =>
      this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(users)
          .values({
            ...input,
            passwordHash,
            isAdmin: true,
            mustChangePassword: true,
            passwordExpiresAt,
            createdBy: actor.id,
          })
          .returning({ id: users.id });
        if (!row) throw new Error('Không tạo được Quản trị viên');
        await this.audit.record(
          { actor, action: 'admin.create', entityType: 'user', entityId: row.id, after: input },
          tx,
        );
        return row;
      }),
    );
    return { id: created.id, temporaryPassword, passwordExpiresAt };
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
  private listCondition({ q, status, roleTag }: UserFilter): SQL | undefined {
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
