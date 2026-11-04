import { expect, type Page, test } from '@playwright/test';
import { openMonitor, room } from './monitor-support';
import { examinerPage, ORIGIN, overflow, seedOpenSession, signIn } from './take-support';

// S6 (Q263, Q264): Quản trị viên không Khóa hay Xóa được người đang trong Phiên thi đang diễn ra; Xóa Người ra đề chuyển
// Phiên thi cho người nhận.

const WARNING = 'Đang trong Phiên thi đang diễn ra';

async function openUser(admin: Page, fullName: string) {
  await admin.goto('/admin/users');
  await admin.getByRole('searchbox', { name: 'Tìm Người dùng' }).fill(fullName);
  await expect(admin).toHaveURL(/q=/);
  await admin.getByRole('link', { name: fullName }).first().click();
  const heading = admin.getByRole('heading', { name: fullName, level: 1 });
  await expect(heading).toBeVisible();
  // Thời gian mở trang chi tiết (kèm dải cảnh báo): tải lại cả trang tới lúc thấy tên người dùng.
  const started = performance.now();
  await admin.reload();
  await expect(heading).toBeVisible();
  return performance.now() - started;
}

test('Quản trị viên thấy dải cảnh báo và nút Khóa, Xóa bị vô hiệu khi người dùng đang trong Phiên thi', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'A', {
    prefix: 'xd',
    fakeClock: false,
  });
  await candidate(1); // sv1 đang làm bài; sv2 chỉ có tên trong Danh sách

  const context = await browser.newContext({ baseURL: ORIGIN });
  const admin = await context.newPage();
  await signIn(admin, `e2e-lb-xd-qt-${project}`);
  const lock = admin.getByRole('button', { name: 'Khóa đăng nhập' });
  const remove = admin.getByRole('button', { name: 'Xóa người dùng' });
  const notice = admin.getByRole('region', { name: WARNING });

  // Chủ của Phiên thi đang diễn ra.
  const ownerMs = await openUser(admin, `Người ra đề Xóa 1 (${project})`);
  await expect(notice).toContainText('Là chủ Phiên thi');
  await expect(notice).toContainText('1 người đang làm bài');
  await expect(lock).toBeDisabled();
  await expect(remove).toBeDisabled();
  await expect(admin.getByRole('button', { name: 'Cấp lại mật khẩu tạm' })).toBeEnabled();
  expect(await overflow(admin), 'trang người dùng có dải cảnh báo').toBe(0);

  // Người dự thi đang làm bài.
  const candidateMs = await openUser(admin, `Thí sinh Xóa 1 (${project})`);
  await expect(notice).toContainText('Đang làm bài trong Phiên thi');
  await expect(lock).toBeDisabled();
  await expect(remove).toBeDisabled();

  // Người chỉ có tên trong Danh sách, chưa vào thi: không có cảnh báo, vẫn Khóa được.
  await openUser(admin, `Thí sinh Xóa 2 (${project})`);
  await expect(notice).toHaveCount(0);
  await expect(lock).toBeEnabled();

  // Người ra đề Buộc nộp cả phòng: Người dự thi hết bị chặn, chủ Phiên thi vẫn bị chặn đến khi Phiên thi hết.
  const forced = await examiner.request.post(`/api/sessions/${sessionId}/force-submit`, {
    headers: { origin: ORIGIN },
    data: { scope: 'all' },
  });
  expect(forced.ok(), await forced.text()).toBe(true);
  await openUser(admin, `Thí sinh Xóa 1 (${project})`);
  await expect(notice).toHaveCount(0);
  await expect(lock).toBeEnabled();
  await openUser(admin, `Người ra đề Xóa 1 (${project})`);
  await expect(notice).toContainText('0 người đang làm bài');
  await expect(lock).toBeDisabled();

  // Thời gian đáp ứng cho Quản trị viên (ngân sách 500 ms cho trang chi tiết kèm cảnh báo, đo cả tải lại trang).
  console.log(
    `[đo] mở trang chi tiết (tải lại): chủ ${ownerMs.toFixed(0)} ms, thí sinh ${candidateMs.toFixed(0)} ms`,
  );
  // Chạy riêng ~350 ms; cả bộ E2E song song chậm gấp 2–3 lần nên ngưỡng cứng đặt 2 giây.
  expect(ownerMs).toBeLessThan(2000);
  expect(candidateMs).toBeLessThan(2000);
});

test('Xóa Người ra đề: hộp xác nhận nêu số Phiên thi; người nhận mở được Theo dõi của Phiên thi vừa nhận', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const letter = project === 'desktop' ? 'D' : 'M';
  // Phiên thi của người sắp bị Xóa: Hủy ngay nên không còn "đang diễn ra" (Hủy cũng chuyển theo).
  const owner = await examinerPage(browser, `e2e-lb-xd-gv2-${project}`);
  const sessionId = await seedOpenSession(
    owner,
    `${project}-B`,
    `XDB${letter}`,
    `XD-${letter}-002`,
  );
  const cancelled = await owner.request.post(`/api/sessions/${sessionId}/cancel`, {
    headers: { origin: ORIGIN },
    data: { reason: 'Đổi lịch' },
  });
  expect(cancelled.ok(), await cancelled.text()).toBe(true);

  const context = await browser.newContext({ baseURL: ORIGIN });
  const admin = await context.newPage();
  await signIn(admin, `e2e-lb-xd-qt-${project}`);
  await openUser(admin, `Người ra đề Xóa 2 (${project})`);
  await expect(admin.getByRole('region', { name: WARNING })).toHaveCount(0);
  await admin.getByRole('button', { name: 'Xóa người dùng' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Xóa người dùng' }).click();

  const dialog = admin.getByRole('dialog', {
    name: `Xóa Người ra đề Xóa 2 (${project}) và chuyển giao nội dung`,
  });
  await expect(
    dialog.getByText(/1 Phiên thi \(sắp mở 0, đã xong 0, đã Hủy 1\) sẽ chuyển theo/),
  ).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Chuyển giao và xóa' });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByLabel('Tìm Người ra đề theo tên hoặc tên đăng nhập')
    .fill(`Người nhận Xóa (${project})`);
  await dialog.getByRole('radio', { name: `Người nhận Xóa (${project})` }).check();
  expect(await overflow(admin), 'hộp thoại xóa có Phiên thi').toBe(0);
  const started = performance.now();
  await confirm.click();
  await expect(dialog.getByText('1 Phiên thi đã chuyển theo.')).toBeVisible();
  const removeMs = performance.now() - started;
  console.log(`[đo] Xóa Người ra đề chuyển Phiên thi: ${removeMs.toFixed(0)} ms`);
  expect(removeMs).toBeLessThan(1500);

  // Người nhận thấy thông báo và mở được Theo dõi của Phiên thi vừa nhận.
  const recipient = await examinerPage(browser, `e2e-lb-xd-nhan-${project}`);
  await recipient.goto('/examiner/sessions');
  await recipient.getByRole('button', { name: /^Thông báo \(\d+ chưa đọc\)/ }).click();
  await expect(
    recipient.getByText('Quản trị viên đã chuyển giao 1 Phiên thi cho bạn.'),
  ).toBeVisible();
  const monitorMs = await openMonitor(recipient, sessionId);
  console.log(`[đo] người nhận mở Theo dõi Phiên thi vừa nhận: ${monitorMs.toFixed(0)} ms`);
  expect(monitorMs).toBeLessThan(2000);
});
