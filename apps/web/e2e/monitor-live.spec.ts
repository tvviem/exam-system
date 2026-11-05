import { expect, type Page, test, type WebSocketRoute } from '@playwright/test';
import { beat, openMonitor, openPerson, room } from './monitor-support';
import { signIn } from './take-support';

// S6 + thời gian đáp ứng cho ba vai (PR 4d-3, Q213). Tin đẩy Socket.IO chỉ là phần tăng tốc: các test dưới đây đo cái người
// dùng thấy (không tua đồng hồ trang Người dự thi), rồi chặn kênh đẩy để chắc hệ thống vẫn đúng khi mất kênh.
// Ngưỡng rộng gấp vài lần số đo thật (khoảng 100–300 ms) vì CI chậm hơn máy phát triển; vẫn đủ bắt lỗi kiểu "chờ 15 giây".

const PUSH_BUDGET_MS = 1500;

/** Chặn Socket.IO (cả WebSocket lẫn polling dự phòng) để giả lập mất kênh đẩy. */
async function blockRealtime(page: Page) {
  await page.routeWebSocket(/\/ws\//, (ws) => ws.close());
  await page.route(/\/ws\//, (route) => route.abort());
}

const confirmExtend = async (examiner: Page, minutes: string, reason: string) => {
  const dialog = examiner.getByRole('dialog', { name: 'Cộng giờ' });
  await dialog.getByLabel('Số phút khác (1–180)').fill(minutes);
  await dialog.getByLabel('Lý do (bắt buộc)').fill(reason);
  await dialog.getByRole('button', { name: new RegExp(`^Cộng ${minutes} phút`) }).click();
};

test('Người dự thi: Cộng giờ, Thu hồi và Buộc nộp của Người ra đề đến màn hình trong dưới 1,5 giây (không tua đồng hồ)', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'dt', {
    prefix: 'live',
    fakeClock: false,
  });
  const sv1 = await candidate(1);
  const sv2 = await candidate(2);
  await openMonitor(examiner, sessionId);
  await expect(examiner.getByText('Cập nhật trực tiếp')).toBeVisible();

  // Cộng giờ cho sv1
  await openPerson(examiner, /Thí sinh Trực tiếp 1/);
  const panel =
    project === 'mobile' ? examiner.getByRole('dialog') : examiner.getByRole('complementary');
  await panel.getByRole('button', { name: 'Cộng giờ…' }).click();
  const asked = performance.now();
  await confirmExtend(examiner, '10', 'Mất điện phòng máy');
  await expect(sv1.getByRole('status').filter({ hasText: 'Người ra đề đã cộng giờ' })).toBeVisible({
    timeout: PUSH_BUDGET_MS,
  });
  const extended = performance.now() - asked;

  // Thu hồi thiết bị của sv1
  await panel.getByRole('button', { name: 'Thu hồi thiết bị…' }).click();
  const revokeAsked = performance.now();
  await examiner
    .getByRole('dialog', { name: 'Thu hồi thiết bị' })
    .getByRole('button', { name: 'Thu hồi' })
    .click();
  await expect(sv1.getByRole('heading', { name: 'Thiết bị này đã bị thu hồi' })).toBeVisible({
    timeout: PUSH_BUDGET_MS,
  });
  const revoked = performance.now() - revokeAsked;

  // Buộc nộp sv2 (chọn một người rồi Buộc nộp)
  await examiner.keyboard.press('Escape');
  await openPerson(examiner, /Thí sinh Trực tiếp 2/);
  await panel.getByRole('button', { name: 'Buộc nộp…' }).click();
  // Tầng bảo vệ Buộc nộp (Q277): gõ lại Mã định danh của đúng người đó mới bấm được.
  const forceDialog = examiner.getByRole('dialog', { name: 'Buộc nộp' });
  await forceDialog.getByLabel(/Gõ lại/).fill(`LIVE-${project === 'desktop' ? 'D' : 'M'}-002`);
  const forceAsked = performance.now();
  await forceDialog.getByRole('button', { name: /^Buộc nộp 1 người/ }).click();
  await expect(sv2.getByRole('heading', { name: 'Đã nộp' })).toBeVisible({
    timeout: PUSH_BUDGET_MS,
  });
  const forced = performance.now() - forceAsked;

  console.info(
    `[${project}] từ lúc bấm đến màn hình Người dự thi đổi: Cộng giờ ${extended} ms, Thu hồi ${revoked} ms, Buộc nộp ${forced} ms`,
  );
});

test('Người ra đề: số câu đã trả lời trên màn Theo dõi đổi trong vài giây mà không tải lại; mất kênh thì tự về hỏi lại', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'gv', {
    prefix: 'live',
    fakeClock: false,
  });
  const sv1 = await candidate(1);
  await candidate(2);
  await openMonitor(examiner, sessionId);
  await expect(examiner.getByText('Cập nhật trực tiếp')).toBeVisible();

  await sv1.getByRole('button', { name: 'Cả đề' }).click(); // điện thoại mặc định "Từng câu"
  const answered = performance.now();
  await sv1.getByRole('radio', { name: 'Hà Nội' }).check();
  await expect(examiner.getByText('1/4').first()).toBeVisible({ timeout: 3000 });
  console.info(
    `[${project}] Người dự thi chọn đáp án → màn Theo dõi đổi sau ${performance.now() - answered} ms`,
  );

  // Mất kênh đẩy ở phía Người ra đề: chỉ báo đổi sang hỏi lại 5 giây, số liệu vẫn tới
  const lost = await examiner.context().newPage();
  await blockRealtime(lost);
  await openMonitor(lost, sessionId);
  await expect(lost.getByText('Cập nhật mỗi 5 giây')).toBeVisible();
  await sv1.getByRole('checkbox', { name: 'hai' }).check();
  await expect(lost.getByText('2/4').first()).toBeVisible({ timeout: 9000 }); // hỏi lại 5 giây một lần
});

test('Người dự thi: mất kênh đẩy thì Cộng giờ vẫn đến qua heartbeat', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'ml', {
    prefix: 'live',
    fakeClock: true,
  });
  const sv1 = await candidate(1, blockRealtime);
  await candidate(2);
  await openMonitor(examiner, sessionId);

  await openPerson(examiner, /Thí sinh Trực tiếp 1/);
  const panel =
    project === 'mobile' ? examiner.getByRole('dialog') : examiner.getByRole('complementary');
  await panel.getByRole('button', { name: 'Cộng giờ…' }).click();
  await confirmExtend(examiner, '5', 'Mạng chập chờn');
  await expect(examiner.getByText('Đã cộng 5 phút cho 1 người')).toBeVisible();
  await beat(sv1); // không có tin đẩy: chờ nhịp heartbeat 15 giây (tua đồng hồ giả)
  await expect(
    sv1.getByRole('status').filter({ hasText: 'Bạn được cộng thêm 5 phút' }),
  ).toBeVisible();
});

test('Quản trị viên và trang không cần kênh đẩy: không mở kết nối Socket.IO, trang quản trị hiện trong dưới 1,5 giây', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const context = await browser.newContext();
  const admin = await context.newPage();
  let sockets = 0;
  admin.on('websocket', () => sockets++);
  await signIn(admin, `e2e-lb-live-qt-${project}`);

  const started = performance.now();
  await admin.goto('/admin/users');
  await expect(admin.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
  const took = performance.now() - started;
  console.info(`[${project}] Quản trị viên mở /admin/users: ${took} ms`);
  expect(took, 'trang quản trị phải hiện tức thì').toBeLessThan(1500);
  await admin.goto('/admin/audit-logs');
  await expect(admin.getByRole('heading', { name: /Nhật ký/ })).toBeVisible();
  expect(sockets, 'trang quản trị không được mở kết nối Socket.IO').toBe(0);

  // Danh sách Phiên thi của Người dự thi cũng không cần kênh đẩy (chỉ màn làm bài và màn Theo dõi mới mở)
  const taker = await browser.newContext().then((c) => c.newPage());
  let takerSockets = 0;
  taker.on('websocket', () => takerSockets++);
  await signIn(taker, `e2e-lb-live-sv1-${project}`);
  await taker.goto('/take');
  await expect(taker.getByRole('heading', { name: 'Vào thi' })).toBeVisible();
  expect(takerSockets, 'danh sách Phiên thi không mở kết nối Socket.IO').toBe(0);
});

test('Người ra đề: kênh đẩy đứt rồi tự nối lại, số liệu phát sinh lúc đứt vẫn được bù', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'nl', {
    prefix: 'live',
    fakeClock: false,
  });
  const sv1 = await candidate(1);
  await candidate(2);

  // Đi qua một đường chuyển tiếp để test đứt được kết nối phía trang (như mạng rớt) mà không cần đụng server
  const sockets: WebSocketRoute[] = [];
  await examiner.routeWebSocket(/\/ws\//, (ws) => {
    ws.connectToServer();
    sockets.push(ws);
  });
  await openMonitor(examiner, sessionId);
  await expect(examiner.getByText('Cập nhật trực tiếp')).toBeVisible();
  expect(sockets.length).toBeGreaterThan(0);

  await sockets[0]?.close();
  await expect(examiner.getByText('Cập nhật mỗi 5 giây')).toBeVisible();
  await sv1.getByRole('button', { name: 'Cả đề' }).click();
  await sv1.getByRole('radio', { name: 'Hà Nội' }).check(); // phát sinh khi kênh đang đứt
  // Tự nối lại, vào phòng lại và tải lại ảnh chụp: số liệu mới hiện và chỉ báo trở về trực tiếp
  await expect(examiner.getByText('Cập nhật trực tiếp')).toBeVisible({ timeout: 15_000 });
  await expect(examiner.getByText('1/4').first()).toBeVisible({ timeout: 5000 });
  expect(sockets.length, 'đã nối lại bằng kết nối mới').toBeGreaterThan(1);
});
