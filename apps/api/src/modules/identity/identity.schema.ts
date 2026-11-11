import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, idColumn, timestamps } from '../../db/columns';

export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);
export const userStatusEnum = pgEnum('user_status', ['active', 'locked']);
export const roleTagEnum = pgEnum('role_tag', ['examiner', 'candidate']);
export const academicDegreeEnum = pgEnum('academic_degree', [
  'bachelor',
  'engineer',
  'master',
  'doctor',
  'doctor_of_science',
]);
export const academicTitleEnum = pgEnum('academic_title', ['associate_professor', 'professor']);

export const units = pgTable('units', {
  id: idColumn(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  ...timestamps,
});

export const users = pgTable(
  'users',
  {
    id: idColumn(),
    username: citext('username'),
    email: citext('email'),
    passwordHash: text('password_hash'),
    fullName: text('full_name').notNull(),
    code: text('code'),
    classLabel: text('class_label'),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),
    isAdmin: boolean('is_admin').notNull().default(false),
    status: userStatusEnum('status').notNull().default('active'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: uuid('locked_by').references((): AnyPgColumn => users.id),
    lockedReason: text('locked_reason'),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    passwordExpiresAt: timestamp('password_expires_at', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    /** Lúc người dùng đặt mật khẩu lần đầu; NULL kèm `password_hash` NULL là Chờ kích hoạt (ADR-0009). */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    /** Lúc chính chủ hộp thư xác nhận email bằng Liên kết một lần; NULL là email chưa xác thực. */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references((): AnyPgColumn => users.id),
    ...timestamps,
  },
  (t) => [
    check('users_username_or_email', sql`${t.username} IS NOT NULL OR ${t.email} IS NOT NULL`),
    uniqueIndex('users_username_active_key').on(t.username).where(sql`${t.removedAt} IS NULL`),
    uniqueIndex('users_email_active_key').on(t.email).where(sql`${t.removedAt} IS NULL`),
    uniqueIndex('users_code_active_key')
      .on(t.code)
      .where(sql`${t.removedAt} IS NULL AND ${t.code} IS NOT NULL`),
    index('users_class_label_idx').on(t.classLabel).where(sql`${t.removedAt} IS NULL`),
  ],
);

export const userRoleTags = pgTable(
  'user_role_tags',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tag: roleTagEnum('tag').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tag] }),
    index('user_role_tags_tag_idx').on(t.tag, t.userId),
  ],
);

export const examinerProfiles = pgTable('examiner_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  academicDegree: academicDegreeEnum('academic_degree'),
  academicTitle: academicTitleEnum('academic_title'),
  unitId: uuid('unit_id').references(() => units.id),
  ...timestamps,
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    deviceLabel: text('device_label'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    ...timestamps,
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)],
);

export const loginEvents = pgTable(
  'login_events',
  {
    id: idColumn(),
    userId: uuid('user_id').references(() => users.id),
    identifierTried: text('identifier_tried').notNull(),
    success: boolean('success').notNull(),
    failureReason: text('failure_reason'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    at: timestamp('at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index('login_events_user_at_idx').on(t.userId, t.at),
    index('login_events_at_idx').on(t.at),
  ],
);

/** Lời mời trở thành Người ra đề. Trạng thái suy ra từ các cột và Clock (Q77), không lưu. */
export const invitations = pgTable(
  'invitations',
  {
    id: idColumn(),
    email: citext('email').notNull(),
    fullName: text('full_name').notNull(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedUserId: uuid('accepted_user_id').references(() => users.id),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('invitations_email_idx').on(t.email)],
);

export const accountRequestStatusEnum = pgEnum('account_request_status', [
  'parsing',
  'parse_failed',
  'pending',
  'approving',
  'approved',
  'partially_approved',
  'rejected',
]);
export const matchStatusEnum = pgEnum('account_request_match_status', [
  'new',
  'exact',
  'name_mismatch',
  'blocked',
]);
export const itemOutcomeEnum = pgEnum('account_request_item_outcome', [
  'pending',
  'created',
  'tag_added',
  'skipped',
  'rejected',
]);

/** Yêu cầu cấp tài khoản Người dự thi do Người ra đề gửi từ file Excel/CSV (docs/data-model.md). */
export const accountRequests = pgTable(
  'account_requests',
  {
    id: idColumn(),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    note: text('note'),
    originalFilename: text('original_filename').notNull(),
    uploadKey: text('upload_key'),
    status: accountRequestStatusEnum('status').notNull().default('parsing'),
    parseError: text('parse_error'),
    rowCount: integer('row_count'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    ...timestamps,
  },
  (t) => [index('account_requests_requested_by_idx').on(t.requestedBy, t.createdAt)],
);

export const accountRequestItems = pgTable(
  'account_request_items',
  {
    id: idColumn(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => accountRequests.id),
    rowNumber: integer('row_number').notNull(),
    fullName: text('full_name'),
    code: text('code'),
    email: text('email'),
    classLabel: text('class_label'),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),
    matchStatus: matchStatusEnum('match_status').notNull(),
    outcome: itemOutcomeEnum('outcome').notNull().default('pending'),
    userId: uuid('user_id').references(() => users.id),
    outcomeNote: text('outcome_note'),
    ...timestamps,
  },
  (t) => [index('account_request_items_request_idx').on(t.requestId, t.rowNumber)],
);

export const credentialSlipStatusEnum = pgEnum('credential_slip_status', [
  'ready',
  'failed',
  'expired',
]);

/** Phiếu tài khoản của một đợt duyệt (Q93). File PDF/Excel nằm trong MediaStore, đã mã hóa AES-256-GCM. */
export const credentialSlips = pgTable(
  'credential_slips',
  {
    id: idColumn(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => accountRequests.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    itemCount: integer('item_count').notNull(),
    status: credentialSlipStatusEnum('status').notNull(),
    pdfKey: text('pdf_key'),
    xlsxKey: text('xlsx_key'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index('credential_slips_request_idx').on(t.requestId)],
);

export const authTokenPurposeEnum = pgEnum('auth_token_purpose', [
  'activation',
  'password_reset',
  'email_change',
  'support_link',
]);

/**
 * Liên kết một lần (ADR-0009): kích hoạt, đặt lại mật khẩu, đổi email, liên kết hỗ trợ. CHỈ lưu SHA-256 của mã,
 * không bao giờ lưu mã đọc được. Mỗi người dùng chỉ có một mã còn hiệu lực mỗi loại (mã mới làm mã cũ `replaced_at`).
 */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    purpose: authTokenPurposeEnum('purpose').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    /** Chỉ cho `email_change`: địa chỉ mới, chỉ đổi khi liên kết được bấm. */
    newEmail: citext('new_email'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    replacedAt: timestamp('replaced_at', { withTimezone: true }),
    /** NULL: người dùng tự yêu cầu; có giá trị: Quản trị viên hoặc Người ra đề tạo. */
    createdBy: uuid('created_by').references(() => users.id),
    /** Bắt buộc với `support_link`. */
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('auth_tokens_user_purpose_idx').on(t.userId, t.purpose)],
);
