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
