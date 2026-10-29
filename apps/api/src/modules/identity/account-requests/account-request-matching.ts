import { inArray, or, sql } from 'drizzle-orm';
import type { Database } from '../../../db/db.module';
import { users } from '../identity.schema';
import type { ParsedRow } from './account-request-file';
import { normalizePersonName } from './person-name';

export type MatchStatus = 'new' | 'exact' | 'name_mismatch' | 'blocked';

/** Lý do một dòng bị chặn (ngoài các lỗi định dạng của `account-request-file`). */
export type BlockReason = 'matches_admin' | 'matches_removed_user' | 'code_email_conflict';

export interface RowMatch {
  matchStatus: MatchStatus;
  /** Tài khoản có sẵn mà dòng này khớp (chỉ khi `exact` hoặc `name_mismatch`). */
  userId: string | null;
  /** Mã lỗi của dòng hoặc lý do chặn, khi `matchStatus = blocked`. */
  note: string | null;
}

interface KnownUser {
  id: string;
  fullName: string;
  isAdmin: boolean;
  removed: boolean;
}

/**
 * Q90: khớp mã trước, email sau, so với mọi tài khoản kể cả đã bị Xóa. Một lần truy vấn cho cả file
 * thay vì một lần mỗi dòng.
 */
export async function matchRows(
  db: Pick<Database, 'select'>,
  rows: ParsedRow[],
): Promise<RowMatch[]> {
  const valid = rows.filter((row) => !row.error);
  const codes = [...new Set(valid.flatMap((r) => (r.code ? [r.code.toLowerCase()] : [])))];
  const emails = [...new Set(valid.flatMap((r) => (r.email ? [r.email.toLowerCase()] : [])))];

  const byCode = new Map<string, KnownUser[]>();
  const byEmail = new Map<string, KnownUser[]>();
  if (codes.length > 0 || emails.length > 0) {
    const found = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        code: users.code,
        email: users.email,
        isAdmin: users.isAdmin,
        removedAt: users.removedAt,
      })
      .from(users)
      .where(
        or(
          codes.length > 0 ? inArray(sql`lower(${users.code})`, codes) : undefined,
          emails.length > 0 ? inArray(users.email, emails) : undefined,
        ),
      );
    for (const user of found) {
      const known = {
        id: user.id,
        fullName: user.fullName,
        isAdmin: user.isAdmin,
        removed: user.removedAt !== null,
      };
      if (user.code) push(byCode, user.code.toLowerCase(), known);
      if (user.email) push(byEmail, user.email.toLowerCase(), known);
    }
  }

  return rows.map((row) => {
    if (row.error) return blocked(row.error);
    const viaCode = (row.code ? byCode.get(row.code.toLowerCase()) : undefined) ?? [];
    const viaEmail = (row.email ? byEmail.get(row.email.toLowerCase()) : undefined) ?? [];
    const candidates = [...new Map([...viaCode, ...viaEmail].map((u) => [u.id, u])).values()];
    const active = candidates.filter((u) => !u.removed);

    if (active.some((u) => u.isAdmin)) return blocked('matches_admin');
    const codeOwner = viaCode.find((u) => !u.removed);
    const emailOwner = viaEmail.find((u) => !u.removed);
    if (codeOwner && emailOwner && codeOwner.id !== emailOwner.id)
      return blocked('code_email_conflict');
    const matched = codeOwner ?? emailOwner;
    if (!matched) {
      return candidates.length > 0
        ? blocked('matches_removed_user')
        : { matchStatus: 'new', userId: null, note: null };
    }
    const sameName =
      normalizePersonName(matched.fullName) === normalizePersonName(row.fullName ?? '');
    return { matchStatus: sameName ? 'exact' : 'name_mismatch', userId: matched.id, note: null };
  });
}

const blocked = (note: string): RowMatch => ({ matchStatus: 'blocked', userId: null, note });

function push(map: Map<string, KnownUser[]>, key: string, user: KnownUser) {
  map.set(key, [...(map.get(key) ?? []), user]);
}
