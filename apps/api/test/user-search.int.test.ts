import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Tìm Người dùng bằng cột `users.search_text` và chỉ mục trigram (docs/plan/quy-mo-lon-thiet-ke.md mục 4.3, Q488). Cột do
// trigger giữ đồng bộ; kết quả tìm phải đúng như khi tìm trên từng cột.

let t: TestApp;
let admin: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'quantri', fullName: 'Quản Trị', isAdmin: true });
  admin = (await login(t.app, 'quantri', DEFAULT_PASSWORD)).cookie as string;
});

const names = async (q: string) => {
  const res = await call(t.app, 'GET', `/api/admin/users?q=${encodeURIComponent(q)}`, {
    cookie: admin,
  });
  expect(res.statusCode, res.body).toBe(200);
  return res
    .json()
    .items.map((u: { fullName: string }) => u.fullName)
    .sort();
};

describe('tìm Người dùng', () => {
  beforeEach(async () => {
    await seedUser({
      username: 'duc.an',
      fullName: 'Đỗ Đức An',
      email: 'an.do@example.edu.vn',
      code: 'SV-2601',
      classLabel: 'CNTT K26',
    });
    await seedUser({ username: 'vy', fullName: 'Lê Vy', code: 'SV-2602' });
  });

  it('khớp từng trường, không dấu, không phân biệt hoa thường; "đ" tìm được bằng "d"', async () => {
    for (const q of ['do duc', 'ĐỨC', 'duc.an', 'an.do@example', 'sv-2601', 'cntt k26']) {
      expect(await names(q), q).toEqual(['Đỗ Đức An']);
    }
  });

  it('từ khóa 1–2 ký tự vẫn tìm được (tên ngắn như An, Vy)', async () => {
    expect(await names('vy')).toEqual(['Lê Vy']);
    expect(await names('an')).toContain('Đỗ Đức An');
  });

  it('không khớp vắt qua hai trường; ký tự đặc biệt của LIKE hiểu theo nghĩa đen', async () => {
    expect(await names('an duc.an')).toEqual([]); // hết họ tên "…An", sang tên đăng nhập "duc.an"
    expect(await names('%')).toEqual([]);
    expect(await names('a_n')).toEqual([]);
  });

  it('sửa thông tin thì tìm theo giá trị mới ngay, giá trị cũ không còn khớp', async () => {
    const [user] = await sql<{ id: string }>(`SELECT id FROM users WHERE username = 'vy'`);
    const res = await call(t.app, 'PATCH', `/api/admin/users/${user?.id}`, {
      cookie: admin,
      body: { fullName: 'Lê Thảo Nguyên', code: 'SV-9999', classLabel: 'TOAN K27' },
    });
    expect(res.statusCode, res.body).toBe(200);
    for (const q of ['thao nguyen', 'sv-9999', 'toan k27']) {
      expect(await names(q), q).toEqual(['Lê Thảo Nguyên']);
    }
    expect(await names('sv-2602')).toEqual([]);
  });

  it('cơ sở dữ liệu tự điền cột tìm kiếm kể cả khi ghi thẳng', async () => {
    await sql(`UPDATE users SET email = 'Moi.Thu@Example.edu.vn' WHERE username = 'vy'`);
    const [row] = await sql<{ search_text: string }>(
      `SELECT search_text FROM users WHERE username = 'vy'`,
    );
    expect(row?.search_text.split('\n')).toEqual([
      'le vy',
      'vy',
      'moi.thu@example.edu.vn',
      'sv-2602',
    ]);
  });

  it('có chỉ mục trigram trên cột tìm kiếm', async () => {
    const [row] = await sql<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'users_search_trgm_idx'`,
    );
    expect(row?.indexdef.replace(/^.* USING /, '')).toBe('gin (search_text gin_trgm_ops)');
  });
});
