import { expect, type Page, test } from '@playwright/test';

// Ô mật khẩu có nút hiện và ẩn: mặc định ẩn, chỉ hiện khi người dùng bấm, tự ẩn lại khi gửi biểu mẫu.

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('đăng nhập: bấm con mắt để xem và ẩn; giữ nội dung; gửi biểu mẫu thì ẩn lại', async ({
  page,
}, testInfo) => {
  await page.goto('/login');
  const field = page.getByLabel('Mật khẩu', { exact: true });
  await expect(field).toHaveAttribute('type', 'password');
  await field.fill('Bi-mat-cua-toi 123');

  const show = page.getByRole('button', { name: 'Hiện mật khẩu' });
  const box = await show.boundingBox();
  const least = testInfo.project.name === 'mobile' ? 44 : 24;
  expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(least);
  // Chữ gõ vào không chui xuống dưới nút.
  const room = await field.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingRight));
  expect(room).toBeGreaterThanOrEqual(box?.width ?? Number.POSITIVE_INFINITY);
  await show.click();
  await expect(field).toHaveAttribute('type', 'text');
  await expect(field).toHaveValue('Bi-mat-cua-toi 123');
  // Đang hiện: bàn phím không tự viết hoa hay sửa chính tả mật khẩu; vẫn là ô tự điền được.
  await expect(field).toHaveAttribute('autocapitalize', 'none');
  await expect(field).toHaveAttribute('autocorrect', 'off');
  await expect(field).toHaveAttribute('spellcheck', 'false');
  await expect(field).toHaveAttribute('autocomplete', 'current-password');
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/mat-khau-${testInfo.project.name}.png` });

  await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
  await expect(field).toHaveAttribute('type', 'password');

  // Gửi biểu mẫu khi đang hiện: ẩn lại ngay.
  await page.getByLabel('Tên đăng nhập hoặc email').fill('khong-co-nguoi-nay');
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(field).toHaveAttribute('type', 'password');
  expect(await overflow(page)).toBe(0);

  // Bàn phím: Tab từ ô mật khẩu tới nút, Enter đổi hiển thị mà không gửi biểu mẫu.
  await field.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Hiện mật khẩu' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(field).toHaveAttribute('type', 'text');
});

test('đổi mật khẩu: mỗi ô có nút riêng, không ô nào mở theo ô khác', async ({ page }, testInfo) => {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(`e2e-tag-${testInfo.project.name}`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-on-dinh');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/change-password');
  const current = page.getByLabel('Mật khẩu hiện tại');
  const next = page.getByLabel('Mật khẩu mới', { exact: true });
  const again = page.getByLabel('Nhập lại mật khẩu mới');
  await expect(page.getByRole('button', { name: 'Hiện mật khẩu' })).toHaveCount(3);
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).nth(1).click();
  await expect(next).toHaveAttribute('type', 'text');
  await expect(current).toHaveAttribute('type', 'password');
  await expect(again).toHaveAttribute('type', 'password');
  expect(await overflow(page)).toBe(0);
});
