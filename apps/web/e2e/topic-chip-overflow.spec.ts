import { expect, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';

// Ngân hàng câu hỏi trên mobile: Chủ đề có tên rất dài phải xuống dòng trong chip, không làm trang rộng hơn màn hình.

test('Chủ đề tên dài không làm trang tràn ngang', async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-chip-${p}`);
  const names = [
    'Công nghệ thông tin và ứng dụng AI - Chương 6: An toàn và đạo đức AI',
    'Công nghệ thông tin và ứng dụng AI - Chương 5: Ứng dụng AI',
  ];
  for (const name of names) {
    const res = await page.request.post('/api/topics', {
      headers: { origin: ORIGIN },
      data: { name: `${name} (${p})` },
    });
    expect(res.ok(), await res.text()).toBe(true);
  }
  await page.goto('/examiner/questions');
  await expect(page.getByRole('heading', { name: 'Ngân hàng câu hỏi' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chương 6/ }).first()).toBeAttached();
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/chu-de-dai-${p}.png` });
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const chip = page.getByRole('button', { name: /Chương 6/ }).first();
  if (await chip.isVisible()) {
    const box = await chip.boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  }

  // Desktop: cột Chủ đề bên trái không được cắt tên bằng "…" (tên dài phải xuống dòng, đọc được đủ).
  if (p === 'desktop') {
    const cut = await page
      .locator('aside button[aria-pressed] > span:first-child')
      .evaluateAll(
        (spans) =>
          spans.filter((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
            .length,
      );
    expect(cut).toBe(0);
  }
});
