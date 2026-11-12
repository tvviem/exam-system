import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

// Mã Lời mời chỉ có trong thư (hàng đợi thư không chứa mã), nên E2E đặt mã đã biết thẳng vào database E2E cho Lời mời vừa tạo.
const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const { Client } = apiRequire('pg');
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://exam:exam@127.0.0.1:5434/exam_e2e';

async function knownTokenFor(email: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query(
      `UPDATE invitations SET token_hash = $1, expires_at = now() + interval '7 days' WHERE email = $2`,
      [createHash('sha256').update(token).digest('hex'), email],
    );
  } finally {
    await db.end();
  }
  return token;
}

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

test('Quản trị viên tạo Lời mời (hệ thống tự gửi thư), người được mời mở liên kết, đặt mật khẩu và vào hệ thống với vai trò Người ra đề', async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const email = `giang-vien-${project}@example.edu.vn`;

  await signIn(page, `e2e-moi-qt-${project}`);
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();

  // Cần có Đơn vị trước khi mời.
  await page.getByRole('link', { name: 'Đơn vị' }).click();
  await page.getByRole('button', { name: 'Thêm Đơn vị' }).click();
  await page.getByLabel('Mã Đơn vị').fill(`CNTT-${project}`);
  await page.getByLabel('Tên Đơn vị').fill(`Khoa CNTT ${project}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText(`Khoa CNTT ${project}`)).toBeVisible();

  await page.getByRole('link', { name: 'Lời mời' }).click();
  await page.getByRole('button', { name: 'Mời Người ra đề' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Họ tên').fill('Lê Thị Giảng');
  await dialog.getByLabel('Email người được mời').fill(email);
  await dialog
    .getByLabel('Đơn vị')
    .selectOption({ label: `CNTT-${project} · Khoa CNTT ${project}` });
  await dialog.getByRole('button', { name: 'Gửi thư mời' }).click();

  // Hệ thống tự gửi thư; không còn hộp "sao chép link" vì mã chỉ nằm trong thư.
  await expect(page.getByText(`Đã gửi thư mời tới ${email}`)).toBeVisible();
  await expect(page.getByTestId('invitation-link')).toHaveCount(0);
  // Hai project (desktop, mobile) dùng chung database nên chỉ nhìn dòng của email này.
  const row = page.getByRole('listitem').filter({ hasText: email });
  await expect(row.getByText('Đang chờ')).toBeVisible();

  // Người được mời mở liên kết trong thư (mã ở mảnh #) ở một trình duyệt khác, chưa đăng nhập.
  const token = await knownTokenFor(email);
  const link = `/invite#${token}`;
  const invitee = await browser.newPage();
  await invitee.goto(link);
  await expect(invitee.getByRole('heading', { name: 'Lời mời làm Người ra đề' })).toBeVisible();
  expect(new URL(invitee.url()).hash).toBe(''); // mã bị xóa khỏi thanh địa chỉ
  await expect(invitee.getByText(email)).toBeVisible();
  await invitee.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-moi-rat-dai');
  await invitee.getByLabel('Nhập lại mật khẩu').fill('mat-khau-moi-rat-dai');
  await invitee.getByLabel('Học vị').selectOption({ label: 'Thạc sĩ' });
  await invitee.getByRole('button', { name: 'Tạo tài khoản và vào hệ thống' }).click();
  await expect(invitee).toHaveURL(/\/examiner\/account-requests/);
  await expect(
    invitee.getByRole('heading', { name: 'Yêu cầu cấp tài khoản', level: 1 }),
  ).toBeVisible();

  // Liên kết dùng một lần.
  await invitee.goto(link);
  await expect(invitee.getByRole('alert')).toContainText('không còn dùng được');
  // Liên kết kiểu cũ (mã trong đường dẫn) không dùng được và báo rõ.
  await invitee.goto(`/invite/${token}`);
  await expect(invitee.getByText('liên kết kiểu cũ')).toBeVisible();
  await invitee.close();

  await page.reload();
  await expect(row.getByText('Đã nhận', { exact: true })).toBeVisible();
});
