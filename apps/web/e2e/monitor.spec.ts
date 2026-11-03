import { type Browser, expect, type Page, test } from '@playwright/test';
import { examinerPage, ORIGIN, overflow, seedOpenSession, signIn } from './take-support';

// S6 (Q252–Q254, Q256, Q259, Q260, Q262): Người ra đề theo dõi, Cộng giờ, Buộc nộp, Cảnh cáo, Đình chỉ, Thu hồi và Hoàn tác
// Thu hồi; Người dự thi ở ngữ cảnh trình duyệt khác nhận thay đổi qua heartbeat. Đồng hồ của trang Người dự thi được tua để
// không phải chờ 15 giây thật.

const BEAT_MS = 15_000;

async function room(browser: Browser, project: string, tag: string) {
  const letter = project === 'desktop' ? 'D' : 'M';
  const code = `MON${tag}${letter}`;
  const examiner = await examinerPage(browser, `e2e-lb-mon-gv-${project}`);
  const sessionId = await seedOpenSession(examiner, `${project}-${tag}`, code, `MON-${letter}-001`);
  const added = await examiner.request.post(`/api/sessions/${sessionId}/roster`, {
    headers: { origin: ORIGIN },
    data: { codes: [`MON-${letter}-002`] },
  });
  expect(added.ok(), await added.text()).toBe(true);

  const candidate = async (n: 1 | 2) => {
    const context = await browser.newContext({ baseURL: ORIGIN });
    const page = await context.newPage();
    await page.clock.install(); // tua được nhịp heartbeat
    await signIn(page, `e2e-lb-mon-sv${n}-${project}`);
    await page.goto('/take');
    await page.getByLabel('Mã vào thi').fill(code);
    await page.getByRole('button', { name: 'Vào thi' }).click();
    await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
    await page.waitForURL(/\/take\/attempts\//);
    await expect(page.getByRole('timer', { name: 'Thời gian còn lại' })).toBeVisible();
    return page;
  };
  return { examiner, sessionId, code, letter, candidate };
}

/** Cho trang Người dự thi gửi nhịp kế tiếp ngay (tua 15 giây của đồng hồ giả). */
const beat = (page: Page) => page.clock.fastForward(BEAT_MS + 100);

const openMonitor = async (examiner: Page, sessionId: string) => {
  const started = Date.now();
  await examiner.goto(`/examiner/sessions/${sessionId}?tab=monitor`);
  await expect(examiner.getByRole('heading', { name: 'Theo dõi phòng thi' })).toBeVisible();
  return Date.now() - started;
};

/** Mở ngăn chi tiết của một người (ngăn kéo ở máy tính, bottom sheet ở điện thoại). */
async function openPerson(examiner: Page, name: RegExp) {
  await examiner.getByRole('button', { name }).first().click();
}

test('Theo dõi: thấy cả phòng, Cộng giờ cho một người, Người dự thi nhận giờ mới và thông báo trong một nhịp', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'cg');
  const sv1 = await candidate(1);
  await candidate(2);

  const ms = await openMonitor(examiner, sessionId);
  console.info(`[${project}] mở màn Theo dõi: ${ms} ms`);
  expect(ms, 'mở màn Theo dõi phải tức thì (cả đăng nhập đã có sẵn)').toBeLessThan(3000);
  expect(await overflow(examiner), 'màn Theo dõi').toBe(0);

  const summary = examiner.getByRole('region', { name: /Tóm tắt phòng thi, 2 người/ });
  await expect(summary.getByRole('button', { name: /Đang làm/ })).toContainText('2');

  const before = await sv1.getByRole('timer').innerText();
  await openPerson(examiner, /Thí sinh Theo dõi 1/);
  // Thẻ cũng có nút "Cộng giờ…" riêng; ở đây thử nút trong ngăn chi tiết (ngăn kéo hoặc bottom sheet).
  const panel =
    project === 'mobile' ? examiner.getByRole('dialog') : examiner.getByRole('complementary');
  await panel.getByRole('button', { name: 'Cộng giờ…' }).click();
  const dialog = examiner.getByRole('dialog', { name: 'Cộng giờ' });
  await dialog.getByRole('button', { name: '+30 phút' }).click();
  await expect(dialog.getByRole('button', { name: /^Cộng 30 phút/ })).toBeDisabled(); // thiếu lý do
  await dialog.getByLabel('Lý do (bắt buộc)').fill('Mất điện phòng máy');
  await dialog.getByRole('button', { name: 'Cộng 30 phút cho 1 người' }).click();
  await expect(examiner.getByText('Đã cộng 30 phút cho 1 người')).toBeVisible();

  // Người dự thi: nhận ở nhịp kế tiếp, kèm thông báo có lý do; đồng hồ nhảy lên ~60 phút
  await beat(sv1);
  const notice = sv1.getByRole('status').filter({ hasText: 'Người ra đề đã cộng giờ' });
  await expect(notice).toContainText('Bạn được cộng thêm 30 phút');
  await expect(notice).toContainText('Mất điện phòng máy');
  const after = await sv1.getByRole('timer').innerText();
  expect(after, `đồng hồ trước ${before}, sau ${after}`).toMatch(/^(5[89]|60):\d\d$/);
  await notice.getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(notice).toBeHidden();
});

test('Theo dõi: Cảnh cáo, Đình chỉ, Thu hồi và Hoàn tác Thu hồi thiết bị', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'vp');
  const sv1 = await candidate(1);
  const sv2 = await candidate(2);
  await openMonitor(examiner, sessionId);

  // Cảnh cáo: bắt buộc lý do; Người dự thi thấy cảnh báo và làm tiếp
  await openPerson(examiner, /Thí sinh Theo dõi 1/);
  await examiner.getByRole('button', { name: 'Cảnh cáo…' }).click();
  const warn = examiner.getByRole('dialog', { name: 'Cảnh cáo' });
  await expect(warn.getByRole('button', { name: 'Cảnh cáo' })).toBeDisabled();
  await warn.getByLabel('Lý do (bắt buộc)').fill('Nhìn bài bạn bên cạnh');
  await warn.getByRole('button', { name: 'Cảnh cáo' }).click();
  await expect(examiner.getByText('Đã Cảnh cáo')).toBeVisible();
  await beat(sv1);
  await expect(sv1.getByRole('alert').filter({ hasText: 'Nhìn bài bạn bên cạnh' })).toBeVisible();
  await expect(sv1.getByRole('timer')).toBeVisible();

  // Thu hồi thiết bị: máy bị chặn trong một nhịp; Hoàn tác Thu hồi thì làm tiếp được
  await examiner.getByRole('button', { name: 'Thu hồi thiết bị…' }).click();
  await examiner
    .getByRole('dialog', { name: 'Thu hồi thiết bị' })
    .getByRole('button', { name: 'Thu hồi' })
    .click();
  await expect(examiner.getByText('Đã Thu hồi thiết bị')).toBeVisible();
  await beat(sv1);
  await expect(sv1.getByRole('heading', { name: 'Thiết bị này đã bị thu hồi' })).toBeVisible();

  await expect(examiner.getByText('Thiết bị bị thu hồi').first()).toBeVisible(); // dấu hiệu Cần chú ý (hỏi lại 5 giây)
  await examiner.getByRole('button', { name: 'Hoàn tác Thu hồi…' }).click();
  await examiner
    .getByRole('dialog', { name: 'Hoàn tác Thu hồi' })
    .getByRole('button', { name: 'Hoàn tác' })
    .click();
  await expect(examiner.getByText('Đã Hoàn tác Thu hồi')).toBeVisible();
  await sv1.reload();
  await expect(sv1.getByRole('timer')).toBeVisible();

  // Đình chỉ người thứ hai: bắt buộc lý do; Lượt đóng, màn Theo dõi hiện Đình chỉ
  await examiner.keyboard.press('Escape');
  await openPerson(examiner, /Thí sinh Theo dõi 2/);
  await examiner.getByRole('button', { name: 'Đình chỉ…' }).click();
  const suspend = examiner.getByRole('dialog', { name: 'Đình chỉ' });
  await suspend.getByLabel('Lý do (bắt buộc)').fill('Dùng tài liệu');
  await suspend.getByRole('button', { name: 'Đình chỉ' }).click();
  await expect(examiner.getByText('Đã Đình chỉ')).toBeVisible();
  await beat(sv2);
  await expect(sv2.getByRole('heading', { name: 'Đã nộp' })).toBeVisible();
  await expect(
    examiner
      .getByRole('region', { name: /Tóm tắt phòng thi/ })
      .getByRole('button', { name: /Vi phạm/ }),
  ).toContainText('2', { timeout: 15_000 });
});

test('Theo dõi: chọn nhóm, Buộc nộp cả nhóm; Đóng cửa vào thi; bộ lọc và chế độ xem', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'bn');
  const sv1 = await candidate(1);
  const sv2 = await candidate(2);
  await openMonitor(examiner, sessionId);

  // Chế độ xem: ít người thì mặc định là Thẻ; đổi sang Bảng và Lưới được
  await expect(examiner.getByRole('button', { name: 'Thẻ', pressed: true })).toBeVisible();
  await examiner.getByRole('button', { name: 'Lưới' }).click();
  await expect(
    examiner.getByRole('button', { name: /Thí sinh Theo dõi 1.*Đang làm/ }),
  ).toBeVisible();
  expect(await overflow(examiner), 'chế độ Lưới').toBe(0);
  await examiner.getByRole('button', { name: 'Bảng' }).click();
  expect(await overflow(examiner), 'chế độ Bảng').toBe(0);

  // Bộ lọc: tìm không phân biệt dấu; điện thoại dùng bottom sheet "Bộ lọc"
  if (project === 'mobile') {
    await examiner.getByRole('button', { name: 'Bộ lọc' }).click();
    await examiner
      .getByRole('dialog', { name: 'Bộ lọc' })
      .getByLabel('Tìm người dự thi')
      .fill('theo doi 2');
    await examiner
      .getByRole('dialog', { name: 'Bộ lọc' })
      .getByRole('button', { name: 'Xong' })
      .click();
  } else {
    await examiner.getByLabel('Tìm người dự thi').fill('theo doi 2');
  }
  await expect(examiner.getByText('1 / 2 người')).toBeVisible();
  await examiner.getByRole('button', { name: 'Bỏ lọc' }).click();
  await expect(examiner.getByText('2 / 2 người')).toBeVisible();

  // Đóng cửa vào thi
  await examiner.getByRole('button', { name: 'Thao tác cả phòng' }).click();
  await examiner.getByRole('menuitem', { name: 'Đóng cửa vào thi…' }).click();
  await examiner
    .getByRole('dialog', { name: 'Đóng cửa vào thi' })
    .getByRole('button', { name: 'Đóng cửa' })
    .click();
  await expect(examiner.getByText('Đã đóng cửa vào thi')).toBeVisible();
  await examiner.getByRole('button', { name: 'Thao tác cả phòng' }).click();
  await expect(examiner.getByRole('menuitem', { name: 'Mở lại cửa vào thi…' })).toBeVisible();
  await examiner.keyboard.press('Escape');

  // Chọn nhóm rồi Buộc nộp: hộp xác nhận nêu số người
  await examiner.getByRole('button', { name: /Chọn nhiều|Chọn$/ }).click();
  await examiner.getByRole('button', { name: /Chọn cả 2 người đang hiện/ }).click();
  await examiner.getByRole('button', { name: 'Buộc nộp…' }).click();
  const dialog = examiner.getByRole('dialog', { name: 'Buộc nộp' });
  await expect(dialog).toContainText('2 người');
  await dialog.getByRole('button', { name: 'Buộc nộp 2 người' }).click();
  await expect(examiner.getByText('Đã Buộc nộp 2 người')).toBeVisible();

  for (const page of [sv1, sv2]) {
    await beat(page);
    await expect(page.getByRole('heading', { name: 'Đã nộp' })).toBeVisible();
    await expect(page.getByText('Người ra đề đã Buộc nộp Lượt làm bài này.')).toBeVisible();
  }
});
