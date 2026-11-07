import { expect, test } from '@playwright/test';
import { examinerPage } from './take-support';

// PROTOTYPE màn Chấm: chụp ảnh ba phương án ở cỡ máy tính và điện thoại, thử gõ điểm. Không chạy trong CI của main.
const OUT = process.env.PROTOTYPE_SHOTS ?? 'test-results/cham-bai';

for (const variant of ['A', 'B', 'C', 'D']) {
  test(`phương án ${variant}`, async ({ browser }, testInfo) => {
    const project = testInfo.project.name;
    const page = await examinerPage(browser, `e2e-lb-pc-gv-${project}`);
    await page.goto(`/examiner/sessions/cham-thu?variant=${variant}`);
    await expect(page.getByText('Prototype, dữ liệu giả')).toBeVisible();
    await page.screenshot({ path: `${OUT}/${variant}-${project}.png`, fullPage: false });
    if (variant === 'A') {
      await page.getByLabel('Điểm', { exact: true }).fill('1,25');
      await page.getByLabel('Điểm', { exact: true }).press('Enter');
      await expect(page.getByText('Đã chấm 4/36')).toBeVisible();
    }
    if (variant === 'B') {
      await page.getByRole('button', { name: /^½/ }).click();
      await expect(page.getByText('Đã chấm 4/36')).toBeVisible();
      await page.getByRole('button', { name: /Hoàn tác/ }).click();
      await expect(page.getByText('Đã chấm 3/36')).toBeVisible();
    }
    if (variant === 'D') {
      await page.getByRole('button', { name: /^½/ }).click();
      await expect(page.getByText('Đã chấm 4/36')).toBeVisible();
      await page.getByRole('button', { name: /Hoàn tác/ }).click();
      await expect(page.getByText('Đã chấm 3/36')).toBeVisible();
      await page.getByRole('button', { name: 'Điểm khác…' }).click();
      await page.getByLabel('Điểm', { exact: true }).fill('1,25');
      await page.getByLabel('Điểm', { exact: true }).press('Enter');
      await expect(page.getByText('Đã chấm 4/36')).toBeVisible();
    }
    if (variant === 'C') {
      await page.getByLabel('Điểm', { exact: true }).first().fill('2');
      await page.getByLabel('Điểm', { exact: true }).first().press('Enter');
      await expect(page.getByText('Đã chấm 4/36')).toBeVisible();
    }
    await page.screenshot({ path: `${OUT}/${variant}-${project}-sau.png`, fullPage: false });
  });
}
