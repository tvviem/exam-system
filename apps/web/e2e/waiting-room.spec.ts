import { expect, test } from '@playwright/test';
import { examinerPage, ORIGIN, seedOpenSession, signIn } from './take-support';

// Phòng chờ (Q284): vào bằng Mã vào thi trước giờ mở, đăng nhập lại về đúng Phòng chờ, Người ra đề thấy số người chờ,
// tới giờ mở thì nút "Bắt đầu làm bài" bật (không tự bắt đầu).

test('Phòng chờ: nhập mã trước giờ mở, Người ra đề thấy đang chờ, tới giờ mở thì bấm Bắt đầu', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const project = testInfo.project.name;
  const L = project === 'desktop' ? 'D' : 'M';
  const code = `PCW${L}${Date.now() % 100000}`;
  const examiner = await examinerPage(browser, `e2e-lb-pc-gv-${project}`);
  const sessionId = await seedOpenSession(examiner, `pc-${project}`, code, `PC-${L}-001`, {
    opensInMs: 25_000,
  });
  const added = await examiner.request.post(`/api/sessions/${sessionId}/roster`, {
    headers: { origin: ORIGIN },
    data: { codes: [`PC-${L}-002`] },
  });
  expect(added.ok(), await added.text()).toBe(true);

  const context = await browser.newContext({ baseURL: ORIGIN });
  const page = await context.newPage();
  await signIn(page, `e2e-lb-pc-sv1-${project}`);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();

  // Vào Phòng chờ: đếm ngược, nút bắt đầu bị khóa.
  await expect(page.getByRole('heading', { name: 'Phòng chờ' })).toBeVisible();
  await expect(page.getByTestId('waiting-countdown')).toHaveText(/^00:\d\d$/);
  await expect(page.getByRole('button', { name: 'Chưa tới giờ mở' })).toBeDisabled();

  // Người ra đề thấy một người đang chờ, người kia chưa vào.
  await examiner.goto(`/examiner/sessions/${sessionId}?tab=monitor`);
  await expect(examiner.getByTestId('waiting-line')).toHaveText(
    'Đã nhập mã 1/2 · đang trực tuyến 1',
  );
  await expect(examiner.getByText('Đang chờ').first()).toBeVisible();
  await examiner.getByRole('button', { name: 'Phòng chờ (1)' }).click();
  await expect(examiner.getByText('1 / 2 người')).toBeVisible();

  // Đăng nhập lại (vào trang gốc) thì về đúng Phòng chờ.
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/take/sessions/${sessionId}$`));
  await expect(page.getByRole('heading', { name: 'Phòng chờ' })).toBeVisible();

  // Tới giờ mở: báo đã mở và nút Bắt đầu bật; vẫn ở trang, không tự bắt đầu.
  await expect(page.getByText(/Phiên thi đã mở/)).toBeVisible({ timeout: 45_000 });
  await expect(page).toHaveURL(new RegExp(`/take/sessions/${sessionId}$`));
  const start = page.getByRole('button', { name: 'Bắt đầu làm bài' });
  await expect(start).toBeEnabled();
  await start.click();
  await page.waitForURL(/\/take\/attempts\//);
  await expect(page.getByRole('timer', { name: 'Thời gian còn lại' })).toBeVisible();
});
