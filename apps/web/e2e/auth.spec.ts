import { expect, test } from '@playwright/test';

test('chưa đăng nhập thì bị chuyển về trang đăng nhập', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
});

test('Quản trị viên đăng nhập lần đầu phải đổi mật khẩu rồi mới vào trang quản trị', async ({
  page,
}, testInfo) => {
  const username = `e2e-quantri-${testInfo.project.name}`;

  await page.goto('/admin');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('khoi-tao-lan-dau');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page.getByRole('heading', { name: 'Đổi mật khẩu' })).toBeVisible();
  await page.getByLabel('Mật khẩu hiện tại').fill('khoi-tao-lan-dau');
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('ngan');
  await page.getByLabel('Nhập lại mật khẩu mới').fill('ngan');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByRole('alert')).toContainText('ít nhất 10 ký tự');

  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('hoa-sen-no-sang');
  await page.getByLabel('Nhập lại mật khẩu mới').fill('hoa-sen-no-sang');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();

  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();

  await page.getByRole('button', { name: 'Tài khoản' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('sai mật khẩu hiển thị lỗi chung', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill('khong-co-ai');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('sai-mat-khau-roi');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('alert')).toContainText('Tên đăng nhập hoặc mật khẩu không đúng.');
});

test('trang đăng nhập có đúng một logo nhãn hiệu BLUni (chân trang, trên nền trắng), không logo nào ở nơi khác', async ({
  page,
}) => {
  await page.goto('/login');
  const logo = page.getByRole('img', { name: 'BLUni' });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveCount(1);
  // Hình nằm trên thẻ trắng nên đọc được cả ở giao diện tối (chữ xanh đậm không nằm trực tiếp trên nền tối).
  const bg = await logo.evaluate(
    (el) => getComputedStyle(el.parentElement as HTMLElement).backgroundColor,
  );
  expect(bg).toBe('rgb(255, 255, 255)');
  // Không có hình nào khác mang nhãn hiệu: chỉ một ảnh trên trang.
  await expect(page.locator('main img')).toHaveCount(1);
});
