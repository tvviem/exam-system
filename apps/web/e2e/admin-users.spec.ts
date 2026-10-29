import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

test('Quản trị viên tìm một người, Khóa đăng nhập, người đó đăng nhập thì thấy báo bị khóa', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;

  await signIn(page, `e2e-khoa-qt-${project}`);
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();

  // Tìm không dấu.
  await page.getByRole('searchbox', { name: 'Tìm Người dùng' }).fill(`nguyen van khoa ${project}`);
  await page
    .getByRole('link', { name: new RegExp(`Nguyễn Văn Khóa ${project}`) })
    .first()
    .click();

  await page.getByRole('button', { name: 'Khóa đăng nhập' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Lý do').fill('Nghi lộ mật khẩu');
  await dialog.getByRole('button', { name: 'Khóa đăng nhập' }).click();
  await expect(page.getByText('Lý do: Nghi lộ mật khẩu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở khóa' })).toBeVisible();

  await page.getByRole('button', { name: 'Tài khoản' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await signIn(page, `e2e-khoa-ndt-${project}`);
  await expect(page.getByRole('alert')).toHaveText(
    'Tài khoản đã bị Khóa đăng nhập. Hãy liên hệ Quản trị viên.',
  );
});
