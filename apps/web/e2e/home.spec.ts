import { expect, test } from '@playwright/test';

test('trang trạng thái báo hệ thống hoạt động bình thường', async ({ page }) => {
  await page.goto('/status');
  await expect(page.getByTestId('health-status')).toHaveText('Hoạt động bình thường');
});
