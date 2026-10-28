import { Client } from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { hashPassword } from '../../src/modules/identity/password/password-hasher';

export interface SeedUser {
  username?: string | null;
  email?: string | null;
  code?: string | null;
  fullName?: string;
  password?: string;
  isAdmin?: boolean;
  roleTags?: ('examiner' | 'candidate')[];
  mustChangePassword?: boolean;
  passwordExpiresAt?: Date | null;
  status?: 'active' | 'locked';
  removed?: boolean;
}

export const DEFAULT_PASSWORD = 'mat-khau-on-dinh';

/** Tạo sẵn Người dùng cho phần chuẩn bị của test, không đi qua API. */
export async function seedUser(
  input: SeedUser = {},
): Promise<{ id: string; username: string | null }> {
  const id = uuidv7();
  const username = input.username === undefined ? `user-${id.slice(-6)}` : input.username;
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  try {
    await pg.query(
      `INSERT INTO users (id, username, email, code, full_name, password_hash, is_admin,
         must_change_password, password_expires_at, status, removed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        username,
        input.email ?? null,
        input.code ?? null,
        input.fullName ?? 'Nguyễn Văn An',
        await hashPassword(input.password ?? DEFAULT_PASSWORD),
        input.isAdmin ?? false,
        input.mustChangePassword ?? false,
        input.passwordExpiresAt ?? null,
        input.status ?? 'active',
        input.removed ? new Date() : null,
      ],
    );
    for (const tag of input.roleTags ?? []) {
      await pg.query('INSERT INTO user_role_tags (user_id, tag) VALUES ($1, $2)', [id, tag]);
    }
  } finally {
    await pg.end();
  }
  return { id, username };
}
