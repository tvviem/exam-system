import { expect, test } from '@playwright/test';
import { examinerPage, seedOpenSession, signIn } from './take-support';

test('Đồng hồ: cảnh báo còn 5 phút và 1 phút, hết giờ tự nộp (S6c)', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const code = `TKCK${tag}`;
  const examiner = await examinerPage(browser, `e2e-lb-gv-${p}`);
  await seedOpenSession(examiner, `${p}-ck`, code, `TK2-${tag}-001`);

  // Test này kiểm đồng hồ phía trình duyệt khi giờ giả tua nhanh. Heartbeat trả giờ thật của server và đặt lại đồng hồ
  // (đúng ngoài đời), nên chặn nó ở đây để giờ giả không bị kéo về giờ thật; heartbeat có test riêng ở monitor.spec.ts.
  await page.route('**/api/take/attempts/*/heartbeat', (route) => route.abort());
  await page.clock.install();
  await page.clock.resume(); // thời gian chạy thật; chỉ tua khi test yêu cầu
  await signIn(page, `e2e-lb-ck-${p}`);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);

  const timer = page.getByRole('timer', { name: 'Thời gian còn lại' });
  await expect(timer).toContainText(/^(29|30):\d\d$/);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.clock.fastForward('25:00');
  await expect(page.getByRole('alert')).toContainText('Còn 5 phút');
  await expect(timer).toContainText(/^0[45]:\d\d$/);

  await page.clock.fastForward('04:00');
  await expect(page.getByRole('alert')).toContainText('Còn 1 phút');

  // Hết giờ: tự nộp, không cần bấm gì
  await page.clock.fastForward('02:00');
  await expect(page.getByRole('heading', { name: 'Đã nộp' })).toBeVisible({ timeout: 15_000 });
});
