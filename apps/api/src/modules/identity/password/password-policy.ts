import { readFileSync } from 'node:fs';
import path from 'node:path';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordPolicyViolation = 'too_short' | 'too_long' | 'common' | 'contains_identity';

export interface PasswordOwner {
  username: string | null;
  email: string | null;
  code: string | null;
}

// Chuỗi định danh ngắn hơn mức này (ví dụ mã 2 ký tự) không được coi là "chứa trong mật khẩu".
const MIN_IDENTITY_LENGTH = 4;

let commonPasswords: Set<string> | undefined;

function loadCommonPasswords(): Set<string> {
  commonPasswords ??= new Set(
    readFileSync(path.join(__dirname, 'common-passwords.txt'), 'utf8').split('\n').filter(Boolean),
  );
  return commonPasswords;
}

/** Trả về danh sách vi phạm theo docs/plan/slice-1.md (Q46); mảng rỗng nghĩa là hợp lệ. */
export function checkPasswordPolicy(
  password: string,
  owner: PasswordOwner,
): PasswordPolicyViolation[] {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return ['too_short'];
  if (length > PASSWORD_MAX_LENGTH) return ['too_long'];

  const lowered = password.toLowerCase();
  if (loadCommonPasswords().has(lowered)) return ['common'];

  const identities = [owner.username, owner.code]
    .filter((value): value is string => !!value && value.length >= MIN_IDENTITY_LENGTH)
    .map((value) => value.toLowerCase());
  if (identities.some((identity) => lowered.includes(identity))) return ['contains_identity'];
  if (owner.email && lowered === owner.email.toLowerCase()) return ['contains_identity'];

  return [];
}
