import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { expectFooterAtBottom } from './dialog-support';

// Yêu cầu cấp tài khoản khớp một tài khoản đã Xóa (docs/plan/yeu-cau-nhieu-giang-vien-thiet-ke.md, E-08): Quản trị viên thấy bảng
// đối chiếu chi tiết và khôi phục sau khi tick riêng; Người ra đề chỉ thấy "đang chờ Quản trị viên xác nhận".
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

/** Sinh viên đã bị Xóa mềm bởi Quản trị viên của bài (chỉ có nhãn Người dự thi). */
async function seedRemovedStudent(project: string, adminUsername: string) {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const admin = await db.query('SELECT id FROM users WHERE username = $1', [adminUsername]);
    const { rows } = await db.query(
      `INSERT INTO users (id, username, email, code, full_name, class_label, status, removed_at, removed_by)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Sinh Viên Khôi Phục', 'K21', 'active', now() - interval '3 days', $4)
       RETURNING id`,
      [`kp-sv-${project}`, `kp.cu.${project}@example.edu.vn`, `KP-${project}`, admin.rows[0].id],
    );
    await db.query("INSERT INTO user_role_tags (user_id, tag) VALUES ($1, 'candidate')", [
      rows[0].id,
    ]);
    return { id: rows[0].id as string, code: `KP-${project}` };
  } finally {
    await db.end();
  }
}

test('Khớp tài khoản đã Xóa: Người ra đề chỉ thấy chờ xác nhận; Quản trị viên thấy đối chiếu chi tiết, tick riêng để khôi phục', async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const fileName = `khoi-phuc-${project}.csv`;
  const student = await seedRemovedStudent(project, `e2e-kp-qt-${project}`);
  const csv = [
    'Họ tên,Mã định danh,Email,Lớp,Ngày sinh,Giới tính',
    `Phạm Hoàn Toàn Mới,KP-MOI-${project},kp.moi.${project}@example.edu.vn,K21,,`,
    `Sinh Viên Khôi Phục,${student.code},kp.moi2.${project}@example.edu.vn,K22,,`,
  ].join('\n');

  // Người ra đề: có hướng dẫn cho lớp nhiều giảng viên (P1), gửi file.
  await signIn(page, `e2e-kp-gv-${project}`);
  await page.goto('/examiner/account-requests');
  await expect(
    page.getByRole('note').filter({ hasText: 'nhiều giảng viên cùng dạy' }),
  ).toBeVisible();
  await page.getByLabel('File danh sách').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(page.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 15_000 });
  // Không lộ tài khoản bị khớp cho Người ra đề.
  await expect(
    page.getByText('Đang chờ Quản trị viên xác nhận.').filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText(/Đã Xóa lúc/)).toHaveCount(0);

  // Quản trị viên: ba thẻ nhóm việc, một nút chính, danh sách gọn (không bảng chi tiết nhúng, không ô tick).
  const admin = await browser.newPage();
  await signIn(admin, `e2e-kp-qt-${project}`);
  await admin.goto('/admin/account-requests');
  await admin.getByRole('link', { name: new RegExp(fileName) }).click();
  await expect(admin.getByRole('button', { name: /Sẵn sàng duyệt/ })).toContainText('1');
  await expect(admin.getByRole('button', { name: /Cần xác nhận/ })).toContainText('1');
  await expect(admin.getByText('Chờ duyệt: còn 1 dòng cần xác nhận')).toBeVisible();
  await expect(admin.getByRole('checkbox')).toHaveCount(0);
  await expect(admin.getByText('Khớp theo')).toHaveCount(0); // chi tiết nằm trong hộp thoại, không ở danh sách
  await expect(admin.getByText(/khác: email, lớp/).filter({ visible: true })).toBeVisible(); // một dòng phụ ngắn cho biết khác ở đâu
  expect(
    await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);

  // Một nút chính duy nhất: duyệt các dòng sẵn sàng (không gồm dòng cần xác nhận).
  await admin.getByRole('button', { name: /^Duyệt 1 dòng sẵn sàng$/ }).click();
  await expect(admin.getByText('Đã tạo tài khoản').filter({ visible: true }).first()).toBeVisible({
    timeout: 20_000,
  });

  // Dòng cần xác nhận: mở hộp thoại đối chiếu, thấy đủ chi tiết và hậu quả, rồi khôi phục.
  await admin
    .getByRole('button', { name: 'Xem và xác nhận dòng 3' })
    .filter({ visible: true })
    .click();
  const dialog = admin.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Đối chiếu dòng 3/ })).toBeVisible();
  await expect(dialog).toContainText('bởi Quản trị Khôi phục');
  await expect(dialog).toContainText('Khớp theo: mã định danh');
  await expect(dialog).toContainText(`kp.cu.${project}@example.edu.vn`); // email cũ của tài khoản
  await expect(dialog).toContainText(`kp.moi2.${project}@example.edu.vn`); // email trong file
  await expect(dialog.getByText('Khác').first()).toBeVisible();
  await expect(dialog).toContainText('giữ nguyên lịch sử và điểm cũ');
  await expect(dialog).toContainText(`gửi thư kích hoạt tới kp.moi2.${project}@example.edu.vn`);
  // Màn thấp: hộp phải cuộn, thanh nút vẫn sát đáy.
  const size = admin.viewportSize() as { width: number; height: number };
  await admin.setViewportSize({ width: size.width, height: 520 });
  await expectFooterAtBottom(dialog, dialog.getByRole('button', { name: 'Để sau' }));
  await admin.setViewportSize(size);
  await dialog.getByRole('button', { name: 'Khôi phục tài khoản' }).click();
  await expect(
    admin.getByText('Đã khôi phục tài khoản').filter({ visible: true }).first(),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(admin.getByText('Đã duyệt', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await admin.close();
});

test('Từ chối dòng khôi phục trong hộp thoại: tài khoản vẫn đã Xóa, "Để sau" đóng hộp thoại mà không quyết', async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const fileName = `tu-choi-${project}.csv`;
  const student = await seedRemovedStudent(`tc-${project}`, `e2e-kp-qt-${project}`);
  const csv = [
    'Họ tên,Mã định danh,Email,Lớp,Ngày sinh,Giới tính',
    `Sinh Viên Khôi Phục,${student.code},tc.moi.${project}@example.edu.vn,K22,,`,
  ].join('\n');
  await signIn(page, `e2e-kp-gv-${project}`);
  await page.goto('/examiner/account-requests');
  await page.getByLabel('File danh sách').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(page.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 15_000 });

  const admin = await browser.newPage();
  await signIn(admin, `e2e-kp-qt-${project}`);
  await admin.goto('/admin/account-requests');
  await admin.getByRole('link', { name: new RegExp(fileName) }).click();
  const open = admin
    .getByRole('button', { name: 'Xem và xác nhận dòng 2' })
    .filter({ visible: true });
  await open.click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Để sau' }).click();
  await expect(admin.getByRole('dialog')).toHaveCount(0);
  await expect(admin.getByText('Chờ duyệt: còn 1 dòng cần xác nhận')).toBeVisible();

  await open.click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Từ chối dòng' }).click();
  await expect(admin.getByText('Bị từ chối').filter({ visible: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  // Không còn dòng nào cần xác nhận hay sẵn sàng.
  await expect(admin.getByRole('button', { name: /Cần xác nhận/ })).toContainText('0');
  await admin.close();
});
