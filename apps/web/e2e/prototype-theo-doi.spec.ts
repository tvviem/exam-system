// PROTOTYPE (Q207): chụp ba phương án màn Theo dõi ở điện thoại và máy tính, kèm kiểm tra tràn ngang và thời gian dựng.
// Chạy: VITE_SHOW_SWITCHER=1 pnpm --filter @exam/web exec playwright test prototype-theo-doi
import { expect, test } from '@playwright/test';
import { signIn } from './take-support';

const OUT = process.env.PROTO_OUT ?? 'test-results/proto';

test('ba phương án Theo dõi', async ({ page }, info) => {
  const kind = info.project.name;
  test.slow();
  await signIn(page, `e2e-lc-gv-${kind}`);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const variant of ['A', 'B', 'C']) {
    const t0 = Date.now();
    await page.goto(`/examiner/sessions/theo-doi-thu?variant=${variant}`);
    await expect(page.getByRole('heading', { name: 'Theo dõi phòng thi' })).toBeVisible();
    await expect(page.getByText(/Đang làm/).first()).toBeVisible();
    const ms = Date.now() - t0;
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    console.log(`[${kind}] ${variant}: dựng xong ${ms} ms, tràn ngang ${overflow}px`);
    await page.screenshot({ path: `${OUT}/${kind}-${variant}-1.png` });
    await page.screenshot({ path: `${OUT}/${kind}-${variant}-full.png`, fullPage: true });
    // Mở một người để xem ngăn kéo / bottom sheet.
    const first =
      variant === 'C'
        ? page.getByRole('button', { name: 'Xử lý' }).first()
        : variant === 'B'
          ? page.getByRole('button', { name: /Đang làm/ }).first()
          : page.getByRole('button', { name: /SV26/ }).first();
    await first.click();
    await expect(page.getByRole('button', { name: /^\+5 phút$/ }).last()).toBeVisible();
    await page.screenshot({ path: `${OUT}/${kind}-${variant}-2-panel.png` });
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});
