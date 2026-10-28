import { expect, test } from '@playwright/test';

test('trang chủ báo hệ thống hoạt động bình thường', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('health-status')).toHaveText('Hoạt động bình thường');
});

test('điều hướng tới trang Vào thi', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Vào thi' }).click();
  await expect(page.getByRole('heading', { name: 'Vào thi' })).toBeVisible();
});
