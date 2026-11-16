import { inArray, or, sql } from 'drizzle-orm';
import type { Database } from '../../../db/db.module';
import { userRoleTags, users } from '../identity.schema';
import type { ParsedRow } from './account-request-file';
import { normalizePersonName } from './person-name';

export type MatchStatus = 'new' | 'exact' | 'name_mismatch' | 'restore' | 'blocked';

/** Lý do một dòng bị chặn (ngoài các lỗi định dạng của `account-request-file`). */
export type BlockReason = 'matches_admin' | 'removed_user_privileged' | 'code_email_conflict';

export interface RowMatch {
  matchStatus: MatchStatus;
  /**
   * Tài khoản có sẵn mà dòng này khớp (`exact`, `name_mismatch`, `restore`, và `blocked` khi khớp một tài khoản đã Xóa có
   * quyền: để Quản trị viên thấy khớp với ai).
   */
  userId: string | null;
  /** Mã lỗi của dòng hoặc lý do chặn, khi `matchStatus = blocked`. */
  note: string | null;
}

interface KnownUser {
  id: string;
  fullName: string;
  isAdmin: boolean;
  removed: boolean;
  /** Nhãn vai trò hiện có. */
  tags: string[];
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
    // Chỉ cần nhãn của tài khoản đã Xóa (để biết có khôi phục được không).
    const removedIds = found.filter((u) => u.removedAt !== null).map((u) => u.id);
    const tagRows =
      removedIds.length > 0
        ? await db
            .select({ userId: userRoleTags.userId, tag: userRoleTags.tag })
            .from(userRoleTags)
            .where(inArray(userRoleTags.userId, removedIds))
        : [];
    const tagsOf = new Map<string, string[]>();
    for (const row of tagRows) tagsOf.set(row.userId, [...(tagsOf.get(row.userId) ?? []), row.tag]);
    for (const user of found) {
      const known = {
        id: user.id,
        fullName: user.fullName,
        isAdmin: user.isAdmin,
        removed: user.removedAt !== null,
        tags: tagsOf.get(user.id) ?? [],
      };
      if (user.code) push(byCode, user.code.toLowerCase(), known);
      if (user.email) push(byEmail, user.email.toLowerCase(), known);
    }
  }

  return rows.map((row) => {
    if (row.error) return blocked(row.error);
    const viaCode = (row.code ? byCode.get(row.code.toLowerCase()) : undefined) ?? [];
    const viaEmail = (row.email ? byEmail.get(row.email.toLowerCase()) : undefined) ?? [];
    // Chủ hiện tại của mã/email là tài khoản chưa bị Xóa; chỉ khi không còn ai dùng mới xét tài khoản đã Xóa.
    const owner = (found: KnownUser[]) => found.find((u) => !u.removed) ?? found[0];
    const codeOwner = owner(viaCode);
    const emailOwner = owner(viaEmail);

    if ([codeOwner, emailOwner].some((u) => u && !u.removed && u.isAdmin)) {
      return blocked('matches_admin');
    }
    if (codeOwner && emailOwner && codeOwner.id !== emailOwner.id)
      return blocked('code_email_conflict');
    const matched = codeOwner ?? emailOwner;
    if (!matched) return { matchStatus: 'new', userId: null, note: null };
    if (matched.removed) {
      // Chỉ khôi phục người chỉ có nhãn Người dự thi; người từng là Quản trị viên hoặc có vai trò khác vẫn bị chặn để file
      // Excel không trả lại quyền đã bị gỡ.
      const candidateOnly = !matched.isAdmin && matched.tags.every((tag) => tag === 'candidate');
      return candidateOnly
        ? { matchStatus: 'restore', userId: matched.id, note: 'will_restore' }
        : { matchStatus: 'blocked', userId: matched.id, note: 'removed_user_privileged' };
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
