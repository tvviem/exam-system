import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const main = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });

// Q106: từ 1024 px thanh bên, dưới đó thanh tab dưới đáy (tối đa 5 mục, mục thứ 5 là "Thêm").
test.describe('khung ứng dụng thích ứng', () => {
  test('từ 1024 px: thanh bên có đủ mục của Quản trị viên, không có tab ngang trong nội dung', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await signIn(page, `e2e-khung-${testInfo.project.name}`);
    const nav = main(page);
    await expect(nav).toBeVisible();
    for (const name of [
      'Người dùng',
      'Yêu cầu cấp tài khoản',
      'Lời mời',
      'Đơn vị',
      'Lịch sử đăng nhập',
      'Nhật ký thao tác',
    ]) {
      await expect(nav.getByRole('link', { name })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: 'Người dùng' })).toHaveClass(/active/);
    // thanh bên đứng cạnh nội dung, không phải hàng tab ngang phía trên
    const box = await nav.boundingBox();
    expect(box?.x).toBeLessThan(40);
    expect(box?.height).toBeGreaterThan(200);
  });

  test('dưới 1024 px: thanh tab dưới đáy 4 mục + "Thêm" mở các mục còn lại', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await signIn(page, `e2e-khung-${testInfo.project.name}`);
    const nav = main(page);
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(880); // sát đáy màn hình
    await expect(nav.getByRole('link')).toHaveCount(4);
    await expect(nav.getByRole('link', { name: 'Yêu cầu' })).toBeVisible();

    await nav.getByRole('button', { name: 'Thêm' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link', { name: 'Lịch sử đăng nhập' })).toBeVisible();
    await dialog.getByRole('link', { name: 'Nhật ký thao tác' }).click();
    await expect(page).toHaveURL(/\/admin\/audit-logs/);
    await expect(page.getByRole('heading', { name: 'Nhật ký thao tác', level: 1 })).toBeVisible();
  });

  test('Người ra đề chỉ thấy mục của mình', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, `e2e-yc-gv-${testInfo.project.name}`);
    const nav = main(page);
    await expect(nav.getByRole('link')).toHaveCount(1);
    await expect(nav.getByRole('link', { name: 'Yêu cầu cấp tài khoản' })).toBeVisible();
  });
});

// Q108: thông báo nổi cho thao tác thành công, tự mất, không chiếm focus.
test('thao tác thành công hiện thông báo nổi rồi tự mất', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, `e2e-khung-${project}`);
  await page.getByRole('link', { name: 'Đơn vị' }).click();
  await page.getByRole('button', { name: 'Thêm Đơn vị' }).click();
  await page.getByLabel('Mã Đơn vị').fill(`TOAST-${project}`);
  await page.getByLabel('Tên Đơn vị').fill(`Khoa thử toast ${project}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu thay đổi' }).click();

  const toast = page.getByRole('status').filter({ hasText: 'Đã thêm Đơn vị' });
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 8000 });
});
