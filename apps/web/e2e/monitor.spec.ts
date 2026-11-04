import { expect, test } from '@playwright/test';
import { beat, openMonitor, openPerson, room } from './monitor-support';
import { overflow } from './take-support';

// S6 (Q252–Q254, Q256, Q259, Q260, Q262): Người ra đề theo dõi, Cộng giờ, Buộc nộp, Cảnh cáo, Đình chỉ, Thu hồi và Hoàn tác
// Thu hồi; Người dự thi ở ngữ cảnh trình duyệt khác nhận thay đổi qua heartbeat. Đồng hồ của trang Người dự thi được tua để
// không phải chờ 15 giây thật.

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

  const before = await sv1.getByRole('timer').textContent();
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
  const after = (await sv1.getByRole('timer').textContent()) ?? '';
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

  // Một câu đã lưu trước khi bị Buộc nộp: phải còn nguyên sau đó
  await sv1.getByRole('radio', { name: 'Hà Nội' }).check();
  await expect(sv1.getByRole('status', { name: 'Trạng thái lưu' })).toContainText('Đã lưu');

  // Cộng giờ cả phòng với số phút tùy ý; thao tác phải xong tức thì (AGENTS.md: > 300 ms đáng xem, > 1 s là lỗi)
  await examiner.getByRole('button', { name: 'Thao tác cả phòng' }).click();
  await examiner.getByRole('menuitem', { name: 'Cộng giờ cả phòng…' }).click();
  const all = examiner.getByRole('dialog', { name: 'Cộng giờ' });
  await expect(all).toContainText('Cả phòng: 2 người');
  await all.getByLabel('Số phút khác (1–180)').fill('7');
  await all.getByLabel('Lý do (bắt buộc)').fill('Mạng phòng máy chập chờn');
  const asked = performance.now();
  await all.getByRole('button', { name: 'Cộng 7 phút cho 2 người' }).click();
  await expect(examiner.getByText('Đã cộng 7 phút cho 2 người')).toBeVisible();
  const took = performance.now() - asked;
  console.info(`[${project}] Cộng giờ cả phòng: ${took} ms`);
  expect(took, 'Cộng giờ cả phòng phải tức thì').toBeLessThan(1000);
  await beat(sv2);
  await expect(
    sv2.getByRole('status').filter({ hasText: 'Bạn được cộng thêm 7 phút' }),
  ).toBeVisible();

  // Chọn nhóm rồi Buộc nộp: hộp xác nhận nêu số người
  await examiner.getByRole('button', { name: /Chọn nhiều|Chọn$/ }).click();
  await examiner.getByRole('button', { name: /Chọn cả 2 người đang hiện/ }).click();
  await examiner.getByRole('button', { name: 'Buộc nộp…' }).click();
  const dialog = examiner.getByRole('dialog', { name: 'Buộc nộp' });
  await expect(dialog).toContainText('2 người');
  await dialog.getByRole('button', { name: 'Buộc nộp 2 người' }).click();
  await expect(examiner.getByText('Đã Buộc nộp 2 người')).toBeVisible();

  // Câu đã lưu vẫn còn sau khi bị Buộc nộp (màn Theo dõi đếm từ dữ liệu đã ghi)
  const snapshot = await examiner.request.get(`/api/sessions/${sessionId}/monitor`);
  const people = (await snapshot.json()).people as {
    fullName: string;
    answered: number;
    state: string;
  }[];
  expect(people.find((p) => p.fullName.includes('Theo dõi 1'))).toMatchObject({
    answered: 1,
    state: 'submitted',
  });

  for (const page of [sv1, sv2]) {
    await beat(page);
    await expect(page.getByRole('heading', { name: 'Đã nộp' })).toBeVisible();
    await expect(page.getByText('Người ra đề đã Buộc nộp Lượt làm bài này.')).toBeVisible();
  }
});

test('Theo dõi: rời màn hình nhiều lần thì Cần chú ý; Cảnh cáo phát sinh lúc trang đóng vẫn hiện sau khi tải lại', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'cc');
  const sv1 = await candidate(1);
  await candidate(2);

  // Rời màn hình 3 lần (giả lập tab ẩn rồi hiện); nhịp gửi ngay khi ẩn nên Người ra đề thấy sớm
  for (let i = 0; i < 3; i++) {
    for (const state of ['hidden', 'visible']) {
      await sv1.evaluate((value) => {
        Object.defineProperty(document, 'visibilityState', { value, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);
    }
  }
  await expect
    .poll(
      async () => {
        await openMonitor(examiner, sessionId);
        return examiner.getByRole('button', { name: /Cần chú ý/ }).textContent();
      },
      { timeout: 15_000 },
    )
    .toContain('(1)');
  await examiner.getByRole('button', { name: /Cần chú ý/ }).click();
  await expect(examiner.getByText('1 / 2 người')).toBeVisible();
  await expect(examiner.getByText('Rời màn hình 3 lần').first()).toBeVisible();

  // Cảnh cáo khi trang của Người dự thi không gửi được nhịp nào (đóng hoặc mất mạng): tải lại vẫn thấy
  await sv1.route('**/api/take/attempts/*/heartbeat', (route) => route.abort());
  await examiner.getByRole('button', { name: 'Chi tiết' }).first().click();
  await examiner.getByRole('button', { name: 'Cảnh cáo…' }).click();
  const warn = examiner.getByRole('dialog', { name: 'Cảnh cáo' });
  await warn.getByLabel('Lý do (bắt buộc)').fill('Mở tab khác trong giờ thi');
  await warn.getByRole('button', { name: 'Cảnh cáo' }).click();
  await expect(examiner.getByText('Đã Cảnh cáo')).toBeVisible();
  await sv1.unroute('**/api/take/attempts/*/heartbeat');
  await sv1.reload();
  await expect(
    sv1.getByRole('alert').filter({ hasText: 'Mở tab khác trong giờ thi' }),
  ).toBeVisible();
});
