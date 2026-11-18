import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

// Làm nổi bật dòng khớp người đã có tài khoản (docs/plan/yeu-cau-noi-bat-khop-va-thu-kich-hoat-thiet-ke.md, mục 3):
// Người ra đề thấy dải tóm tắt, dòng có sẵn nổi bật hẳn so với dòng mới, và lọc riêng được các dòng này.
const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const { Client } = apiRequire('pg');
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://exam:exam@127.0.0.1:5434/exam_e2e';
const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Sinh viên đang hoạt động (chỉ nhãn Người dự thi). Hậu tố ngẫu nhiên để chạy lại không đụng dữ liệu cũ. */
async function seedStudent(tag: string) {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const { rows } = await db.query(
      `INSERT INTO users (id, username, email, code, full_name, class_label, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Sinh Viên Đã Có', 'K21', 'active') RETURNING id`,
      [`nb-sv-${tag}`, `nb.cu.${tag}@example.edu.vn`, `NB-${tag}`],
    );
    await db.query("INSERT INTO user_role_tags (user_id, tag) VALUES ($1, 'candidate')", [
      rows[0].id,
    ]);
    return { code: `NB-${tag}`, email: `nb.cu.${tag}@example.edu.vn` };
  } finally {
    await db.end();
  }
}

async function upload(page: Page, fileName: string, rows: string[]) {
  await page.goto('/examiner/account-requests');
  await page.getByLabel('File danh sách').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(
      ['Họ tên,Mã định danh,Email,Lớp,Ngày sinh,Giới tính', ...rows].join('\n'),
      'utf8',
    ),
  });
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(page.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 15_000 });
}

test('Có cả người mới lẫn người đã có tài khoản: dải tóm tắt, dòng nổi bật, lọc riêng, nhãn một dòng', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const tag = `${project}-${randomBytes(3).toString('hex')}`;
  const student = await seedStudent(tag);
  await signIn(page, `e2e-nb-gv-${project}`);
  await upload(page, `noi-bat-${tag}.csv`, [
    `Người Hoàn Toàn Mới,NB-MOI-${tag},nb.moi.${tag}@example.edu.vn,K21,,`,
    `Sinh Viên Đã Có,${student.code},${student.email},K21,,`,
  ]);

  // Dải tóm tắt (ghi chú tĩnh, có biểu tượng và chữ), nêu hậu quả cho người đã có tài khoản.
  const banner = page.getByRole('note').filter({ hasText: 'Có 1 dòng khớp tài khoản có sẵn' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('không nhận thư kích hoạt mới');

  // Dòng của người đã có tài khoản nổi bật; dòng người mới thì không.
  const highlighted = page.locator('[data-highlight="true"]').filter({ visible: true });
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toContainText('Sinh Viên Đã Có');
  await expect(
    page.locator('[data-highlight="true"]').filter({ hasText: 'Người Hoàn Toàn Mới' }),
  ).toHaveCount(0);

  // Nhãn huy hiệu nằm trọn một dòng (không xuống dòng ở điện thoại).
  const badge = highlighted.getByText('Khớp tài khoản có sẵn', { exact: true });
  const box = await badge.boundingBox();
  expect(box?.height ?? 99).toBeLessThan(30);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  // Lọc riêng các dòng này, rồi bỏ lọc.
  await banner.getByRole('button', { name: 'Chỉ xem 1 dòng này' }).click();
  await expect(page).toHaveURL(/existing=true/);
  await expect(page.getByText('Người Hoàn Toàn Mới').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText('Sinh Viên Đã Có').filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Xem tất cả/ }).click();
  await expect(
    page.getByText('Người Hoàn Toàn Mới').filter({ visible: true }).first(),
  ).toBeVisible();
});

test('Toàn người mới: không có dải tóm tắt và không dòng nào nổi bật', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const tag = `${project}-${randomBytes(3).toString('hex')}`;
  await signIn(page, `e2e-nb-gv-${project}`);
  await upload(page, `toan-moi-${tag}.csv`, [
    `Người Mới Một,NB-M1-${tag},nb.m1.${tag}@example.edu.vn,K21,,`,
    `Người Mới Hai,NB-M2-${tag},nb.m2.${tag}@example.edu.vn,K21,,`,
  ]);
  await expect(page.getByText('Người Mới Một').filter({ visible: true }).first()).toBeVisible();
  await expect(
    page.getByRole('note').filter({ hasText: /dòng khớp tài khoản có sẵn/ }),
  ).toHaveCount(0);
  await expect(page.locator('[data-highlight="true"]')).toHaveCount(0);
});
