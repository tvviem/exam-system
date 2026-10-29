import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

test('Quản trị viên tạo Lời mời, người được mời mở link, đặt mật khẩu và vào hệ thống với vai trò Người ra đề', async ({
  page,
  browser,
  context,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
  await dialog.getByRole('button', { name: 'Tạo link mời' }).click();

  const link = (await page.getByTestId('invitation-link').textContent())?.trim() as string;
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  // Nút Sao chép đưa đúng link vào clipboard.
  await page.getByRole('button', { name: 'Sao chép link', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await page.getByRole('button', { name: 'Tôi đã sao chép link' }).click();
  // Hai project (desktop, mobile) dùng chung database nên chỉ nhìn dòng của email này.
  const row = page.getByRole('listitem').filter({ hasText: email });
  await expect(row.getByText('Đang chờ')).toBeVisible();

  // Người được mời mở link ở một trình duyệt khác, chưa đăng nhập.
  const invitee = await browser.newPage();
  await invitee.goto(link);
  await expect(invitee.getByRole('heading', { name: 'Lời mời làm Người ra đề' })).toBeVisible();
  await expect(invitee.getByText(email)).toBeVisible();
  await invitee.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-moi-rat-dai');
  await invitee.getByLabel('Nhập lại mật khẩu').fill('mat-khau-moi-rat-dai');
  await invitee.getByLabel('Học vị').selectOption({ label: 'Thạc sĩ' });
  await invitee.getByRole('button', { name: 'Tạo tài khoản và vào hệ thống' }).click();
  await expect(invitee).toHaveURL(/\/examiner\/account-requests/);
  await expect(
    invitee.getByRole('heading', { name: 'Yêu cầu cấp tài khoản', level: 1 }),
  ).toBeVisible();

  // Link dùng một lần.
  await invitee.goto(link);
  await expect(invitee.getByRole('alert')).toContainText('không còn dùng được');
  await invitee.close();

  await page.reload();
  await expect(row.getByText('Đã nhận', { exact: true })).toBeVisible();
});
