import { expect, test } from '@playwright/test';
import { openMonitor, room } from './monitor-support';
import { overflow, signIn } from './take-support';

// Q281–Q283: thanh dưới nêu rõ tiến độ và rà soát nhanh; thông báo của Người ra đề ghim ở thanh trên; Người dự thi luôn có
// chỗ quay về Phiên thi. Chạy ở cả điện thoại (360 px) và máy tính.

test('Thanh dưới nêu tiến độ thật; bảng chọn câu lọc chưa làm/đánh dấu và nhảy tới câu kế tiếp', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { candidate } = await room(browser, project, 'T', { prefix: 'gd', fakeClock: false });
  const page = await candidate(1);
  // Máy tính mở sẵn "Cả đề"; bài kiểm này thử từng câu một.
  await page.getByRole('button', { name: 'Từng câu' }).click();

  const bar = page.getByRole('button', { name: /^Danh sách câu/ });
  await expect(bar).toContainText('Đã làm 0/4 câu');
  await expect(bar).toContainText('Còn 4 chưa làm');
  expect(await overflow(page), 'thanh dưới').toBe(0);

  // Làm câu 1 và đánh dấu: tiến độ đổi ngay (không chờ server)
  const started = performance.now();
  await page.getByRole('radio', { name: 'Hà Nội' }).check();
  await expect(bar).toContainText('Đã làm 1/4 câu');
  console.info(
    `[${project}] chọn đáp án đến lúc thanh dưới đổi: ${(performance.now() - started).toFixed(0)} ms`,
  );
  expect(performance.now() - started, 'thanh dưới cập nhật tức thì').toBeLessThan(500);
  await page.getByRole('button', { name: 'Đánh dấu xem lại' }).click();
  await expect(bar).toContainText('Còn 3 chưa làm · 1 đánh dấu');

  // Bảng chọn câu: tóm tắt, lọc, nhảy tới câu chưa làm kế tiếp
  await bar.click();
  const grid = page.getByRole('dialog', { name: 'Danh sách câu' });
  await expect(grid).toContainText('Đã làm 1/4 câu');
  expect(await overflow(page), 'bảng chọn câu').toBe(0);
  const blank = grid.getByRole('button', { name: '3 chưa làm' });
  await blank.click();
  await expect(blank).toHaveAttribute('aria-pressed', 'true');
  await expect(grid.getByRole('button', { name: /^Câu 1,/ })).toHaveCount(0); // đã làm: bị lọc ra
  await expect(grid.getByRole('button', { name: /^Câu [234], chưa làm/ })).toHaveCount(3);
  await grid.getByRole('button', { name: 'Đến câu chưa làm kế tiếp' }).click();
  await expect(grid).toBeHidden();
  await expect(page.getByText(/^Chọn các số nguyên tố/)).toBeVisible(); // câu 2

  // Lọc "đánh dấu" rồi bỏ lọc bằng cách chạm lần nữa
  await bar.click();
  const flagged = grid.getByRole('button', { name: '1 đánh dấu' });
  await flagged.click();
  await expect(grid.getByRole('button', { name: /^Câu 1, đã làm, đánh dấu/ })).toBeVisible();
  await expect(grid.getByRole('button', { name: /^Câu 2,/ })).toHaveCount(0);
  await flagged.click();
  await expect(grid.getByRole('button', { name: /^Câu 2,/ })).toBeVisible();
});

test('Cảnh cáo và Cộng giờ ghim ở thanh trên: thấy ngay dù đang cuộn xuống cuối ở chế độ Cả đề', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'N', {
    prefix: 'gd',
    fakeClock: false,
  });
  const page = await candidate(1);
  await page.getByRole('button', { name: 'Cả đề' }).click();
  // Cuộn xuống cuối đề: đầu trang (nơi thông báo từng nằm) không còn trong màn hình
  await page.getByRole('textbox', { name: 'Câu trả lời' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
  await expect(page.getByRole('heading', { name: /^Câu 1/ })).not.toBeInViewport();

  await openMonitor(examiner, sessionId);
  const monitor = await (await examiner.request.get(`/api/sessions/${sessionId}/monitor`)).json();
  const attemptId = (monitor.people as { fullName: string; attemptId: string }[]).find((p) =>
    p.fullName.includes('Giao diện 1'),
  )?.attemptId;
  const headers = { origin: 'http://localhost:4173' };
  const sent = performance.now();
  await examiner.request.post(`/api/sessions/${sessionId}/extend-time`, {
    headers,
    data: {
      attemptIds: [attemptId],
      minutes: 5,
      reason: 'Mạng chậm',
      batchId: crypto.randomUUID(),
    },
  });
  await examiner.request.post(`/api/sessions/${sessionId}/attempts/${attemptId}/violations`, {
    headers,
    data: { action: 'warning', reason: 'Nhìn bài bạn bên cạnh' },
  });

  // Cảnh cáo được ưu tiên và nằm trong màn hình hiện tại, không phải cuộn lên đầu trang
  const warning = page.getByRole('alert').filter({ hasText: 'Nhìn bài bạn bên cạnh' });
  await expect(warning).toBeInViewport({ timeout: 5000 });
  console.info(
    `[${project}] từ lúc gửi đến khi cảnh báo hiện trong màn hình: ${(performance.now() - sent).toFixed(0)} ms`,
  );
  await expect(page.getByText(/và 1 thông báo khác/)).toBeVisible();
  expect(await overflow(page), 'thông báo ghim').toBe(0);
  // Vùng thông báo không che quá 30% màn hình
  const box = await warning.boundingBox();
  const viewport = page.viewportSize();
  expect((box?.height ?? 0) / (viewport?.height ?? 1)).toBeLessThan(0.3);

  // Cảnh cáo không tự tắt; bấm "Đã hiểu" thì tới thông báo Cộng giờ
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'Đã hiểu' }).click();
  // Cộng giờ tự đóng sau ~15 giây dù trang vẽ lại mỗi giây (đồng hồ): không bấm gì cũng biến mất
  const extended = page.getByRole('status').filter({ hasText: 'Người ra đề đã cộng giờ' });
  await expect(extended).toBeInViewport();
  await expect(extended).toHaveCount(0, { timeout: 25_000 });
});

test('Người dự thi luôn có chỗ quay về Phiên thi: thanh tab/liên kết đầu trang và nút ở trang Tài khoản', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const context = await browser.newContext({ baseURL: 'http://localhost:4173' });
  const page = await context.newPage();
  await signIn(page, `e2e-lb-gd-sv2-${project}`);
  await page.goto('/take');
  await expect(page.getByRole('heading', { name: 'Vào thi' })).toBeVisible();

  const mobile = project === 'mobile';
  const main = page.getByRole('navigation', { name: 'Điều hướng chính' });
  const toTake = main.getByRole('link', { name: mobile ? 'Phiên thi' : 'Phiên thi của tôi' });
  const toAccount = main.getByRole('link', { name: mobile ? 'Tài khoản' : 'Tài khoản của tôi' });
  await expect(toTake).toBeVisible();
  await expect(toTake).toHaveClass(/active/);
  expect(await overflow(page), 'trang Vào thi').toBe(0);

  // Lỡ bấm sang Tài khoản: vẫn thấy rõ lối về
  await toAccount.click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(toAccount).toHaveClass(/active/);
  const back = page.getByRole('link', { name: 'Về Phiên thi của tôi' });
  await expect(back).toBeVisible();
  // Vùng chạm đủ lớn trên màn cảm ứng (con trỏ chuột dùng nút gọn hơn theo ui-design)
  if (mobile) expect((await back.boundingBox())?.height).toBeGreaterThanOrEqual(48);
  expect(await overflow(page), 'trang Tài khoản').toBe(0);

  // Trang Phiên đăng nhập cũng có
  await page.goto('/account/auth-sessions');
  await expect(page.getByRole('link', { name: 'Về Phiên thi của tôi' })).toBeVisible();
  await page.getByRole('link', { name: 'Về Phiên thi của tôi' }).click();
  await expect(page).toHaveURL(/\/take$/);
  await expect(page.getByRole('heading', { name: 'Vào thi' })).toBeVisible();
  await context.close();
});

test('Cả đề: "Đến câu chưa làm kế tiếp" tính từ câu đang xem, không phải từ câu đầu', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { candidate } = await room(browser, project, 'K', { prefix: 'gd', fakeClock: false });
  const page = await candidate(1);
  await page.getByRole('button', { name: 'Cả đề' }).click();
  await page.getByRole('radio', { name: 'Hà Nội' }).check(); // câu 1 đã làm
  // Cuộn tới câu 3 (chùm đúng/sai, chưa làm): câu 2 đã nằm phía trên màn hình
  await page.getByText(/^Xét hàm số bậc ba/).scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('article[id^="item-"]')][2];
    el?.scrollIntoView({ block: 'start' });
  });
  await page.getByRole('button', { name: /^Danh sách câu/ }).click();
  const grid = page.getByRole('dialog', { name: 'Danh sách câu' });
  await grid
    .getByRole('button', { name: /chưa làm$/ })
    .first()
    .click();
  await grid.getByRole('button', { name: 'Đến câu chưa làm kế tiếp' }).click();
  // Từ câu 3 (đang xem) kế tiếp là câu 4 (tự luận); nếu tính từ câu 1 thì sẽ nhảy lên câu 2
  await expect(page.getByRole('textbox', { name: 'Câu trả lời' })).toBeInViewport();
});
