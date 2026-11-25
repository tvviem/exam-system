import { expect, type Page, test } from '@playwright/test';
import { openPage, readState, shot, signIn } from './support';

// Ngày thi: nhiều Người dự thi làm bài, Người ra đề theo dõi phòng thi (tài liệu nguoi-ra-de.md, nguoi-du-thi.md).

const CODE = 'TIN101';

async function enter(page: Page, username: string) {
  await signIn(page, username);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(CODE);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);
  await expect(page.getByRole('timer', { name: 'Thời gian còn lại' })).toBeVisible();
}

/** Làm trọn bài (chế độ Cả đề trên máy tính) rồi nộp; `seed` làm điểm mỗi người một khác. */
async function takeAndSubmit(page: Page, seed: number) {
  const radios = page.getByRole('radio');
  const n = await radios.count();
  for (let i = 0; i < n; i++) if ((i + seed) % 3 === 0) await radios.nth(i).check();
  const checks = page.getByRole('checkbox');
  const m = await checks.count();
  for (let i = 0; i < m; i++) if ((i + seed) % 2 === 0) await checks.nth(i).check();
  const essays = page.getByRole('textbox', { name: 'Câu trả lời' });
  for (let i = 0; i < (await essays.count()); i++) {
    await essays
      .nth(i)
      .fill(`Bài làm của thí sinh ${seed}: RAM là bộ nhớ tạm, ROM là bộ nhớ chỉ đọc.`);
    await essays.nth(i).blur();
  }
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: /^Nộp bài/ })
    .last()
    .click();
  await expect(page.getByRole('heading', { name: 'Đã nộp' })).toBeVisible({ timeout: 30_000 });
}

test('Bảy Người dự thi làm xong; ba người đang làm; Người ra đề theo dõi phòng thi', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  // Bảy người làm trọn bài (không chụp)
  for (const [i, user] of [
    'sv26002',
    'sv26003',
    'sv26004',
    'sv26005',
    'sv26006',
    'sv26007',
  ].entries()) {
    const page = await openPage(browser, 'desktop');
    await enter(page, user);
    await takeAndSubmit(page, i + 1);
    await page.context().close();
  }

  // Ba người đang làm dở trên điện thoại
  const phones: Page[] = [];
  for (const user of ['sv26008', 'sv26009', 'sv26010']) {
    const phone = await openPage(browser, 'phone');
    await enter(phone, user);
    await phone.getByRole('radio').first().check();
    phones.push(phone);
  }

  const examiner = await openPage(browser, 'desktop');
  await signIn(examiner, 'tran.mai');
  const sessionPath = new URL(readState().sessionUrl).pathname;
  await examiner.goto(`${sessionPath}?tab=monitor`);
  await expect(examiner.getByRole('heading', { name: 'Theo dõi phòng thi' })).toBeVisible();
  await expect(examiner.getByRole('region', { name: /Tóm tắt phòng thi/ })).toBeVisible();
  await examiner.waitForTimeout(2500);
  await shot(examiner, 'nguoi-ra-de', '60-theo-doi-phong-thi', {
    full: true,
    marks: [
      {
        at: examiner.getByRole('region', { name: /Tóm tắt phòng thi/ }),
        text: 'Tóm tắt phòng thi: đang làm, đã nộp, mất kết nối, chưa vào, vi phạm (bấm để lọc)',
      },
      {
        at: examiner.getByRole('button', { name: 'Bảng' }),
        text: 'Chuyển cách xem: Thẻ, Bảng hoặc Lưới (tự chọn theo số người)',
      },
    ],
  });
  await examiner.getByRole('button', { name: 'Bảng' }).click();
  await shot(examiner, 'nguoi-ra-de', '61-theo-doi-dang-bang', { full: true });
  await examiner.getByRole('button', { name: 'Lưới' }).click();
  await shot(examiner, 'nguoi-ra-de', '62-theo-doi-dang-luoi', { full: true });
  await examiner.getByRole('button', { name: 'Thẻ' }).click();

  // Ngăn chi tiết một người và các thao tác
  await examiner
    .getByRole('button', { name: /Hoàng Thị Lan/ })
    .first()
    .click();
  const panel = examiner.getByRole('complementary');
  await expect(panel.getByRole('button', { name: 'Cộng giờ…' })).toBeVisible();
  await shot(examiner, 'nguoi-ra-de', '63-chi-tiet-nguoi-dang-thi', {
    marks: [
      {
        at: panel.getByRole('button', { name: 'Cộng giờ…' }),
        text: 'Cộng giờ cho người này (có lý do)',
      },
      {
        at: panel.getByRole('button', { name: 'Cảnh cáo…' }),
        text: 'Cảnh cáo: người dự thi nhận thông báo ngay',
      },
      {
        at: panel.getByRole('button', { name: 'Thu hồi thiết bị…' }),
        text: 'Thu hồi thiết bị để người này đổi máy khi có sự cố',
      },
      {
        at: panel.getByRole('button', { name: 'Đình chỉ…' }),
        text: 'Đình chỉ: dừng bài của người này',
      },
      {
        at: panel.getByRole('button', { name: 'Buộc nộp…' }),
        text: 'Buộc nộp bài (phải gõ lại Mã định danh, Hoàn tác được trong 10 phút)',
      },
    ],
  });
  await panel.getByRole('button', { name: 'Cộng giờ…' }).click();
  const extra = examiner.getByRole('dialog', { name: 'Cộng giờ' });
  await extra.getByRole('button', { name: '+30 phút' }).click();
  await extra.getByLabel('Lý do (bắt buộc)').fill('Mất điện phòng máy 10 phút');
  await shot(examiner, 'nguoi-ra-de', '64-cong-gio', {
    marks: [
      { at: extra.getByRole('button', { name: '+30 phút' }), text: 'Chọn số phút cộng thêm' },
      { at: extra.getByLabel('Lý do (bắt buộc)'), text: 'Ghi lý do (bắt buộc, lưu vào nhật ký)' },
      { at: extra.getByRole('button', { name: /^Cộng 30 phút/ }), text: 'Bấm Cộng giờ' },
    ],
  });
  await extra.getByRole('button', { name: /^Cộng 30 phút/ }).click();
  const notice = phones[0]?.getByRole('status').filter({ hasText: 'Người ra đề đã cộng giờ' });
  await expect(notice).toBeVisible({ timeout: 25_000 });
  if (phones[0]) await shot(phones[0], 'nguoi-du-thi', '17-thong-bao-cong-gio');

  // Cảnh cáo
  await examiner
    .getByRole('button', { name: /Ngô Thanh Nam/ })
    .first()
    .click();
  await examiner.getByRole('complementary').getByRole('button', { name: 'Cảnh cáo…' }).click();
  const warn = examiner.getByRole('dialog', { name: 'Cảnh cáo' });
  await warn.getByLabel('Lý do (bắt buộc)').fill('Nhìn bài bạn bên cạnh');
  await shot(examiner, 'nguoi-ra-de', '65-canh-cao', {
    marks: [
      { at: warn.getByLabel('Lý do (bắt buộc)'), text: 'Lý do Cảnh cáo (người dự thi đọc được)' },
    ],
  });
  await warn.getByRole('button', { name: 'Cảnh cáo' }).click();
  const alert = phones[1]?.getByRole('alert').filter({ hasText: 'Nhìn bài bạn bên cạnh' });
  await expect(alert).toBeVisible({ timeout: 25_000 });
  if (phones[1]) await shot(phones[1], 'nguoi-du-thi', '18-thong-bao-canh-cao');

  // Buộc nộp một người (gõ lại Mã định danh)
  await examiner
    .getByRole('button', { name: /Đỗ Thị Oanh/ })
    .first()
    .click();
  await examiner.getByRole('complementary').getByRole('button', { name: 'Buộc nộp…' }).click();
  const force = examiner.getByRole('dialog', { name: 'Buộc nộp' });
  await expect(force).toBeVisible();
  const typed = force.getByRole('textbox').first();
  await typed.fill('SV26010');
  await shot(examiner, 'nguoi-ra-de', '66-buoc-nop', {
    marks: [
      { at: typed, text: 'Gõ lại Mã định danh của người bị Buộc nộp để xác nhận' },
      {
        at: force.getByRole('button', { name: /^Buộc nộp 1 người/ }),
        text: 'Bấm Buộc nộp (Hoàn tác được trong 10 phút)',
      },
    ],
  });
  await force.getByRole('button', { name: /^Buộc nộp 1 người/ }).click();
  await expect(
    examiner.getByRole('status').filter({ hasText: '1 người vừa bị Buộc nộp' }),
  ).toBeVisible();
  await shot(examiner, 'nguoi-ra-de', '67-hoan-tac-buoc-nop', {
    toast: true,
    marks: [
      {
        at: examiner.getByRole('status').filter({ hasText: '1 người vừa bị Buộc nộp' }),
        text: 'Bấm Hoàn tác nếu Buộc nộp nhầm (trong 10 phút)',
      },
    ],
  });

  // Hai người còn lại nộp bài để phiên thi chấm được
  for (const phone of phones.slice(0, 2)) {
    await phone.getByRole('button', { name: 'Nộp bài' }).click();
    await phone
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: /^Nộp bài/ })
      .last()
      .click();
    await expect(phone.getByRole('heading', { name: 'Đã nộp' })).toBeVisible({ timeout: 30_000 });
  }

  // Menu "Thao tác cả phòng": Cộng giờ cả phòng, Buộc nộp cả phòng, Đóng cửa vào thi
  await examiner.getByRole('button', { name: 'Thao tác cả phòng' }).click();
  await shot(examiner, 'nguoi-ra-de', '68-thao-tac-ca-phong', {
    marks: [
      {
        at: examiner.getByRole('menuitem', { name: 'Buộc nộp cả phòng…' }),
        text: 'Buộc nộp cả phòng (gõ lại số người để xác nhận)',
      },
      {
        at: examiner.getByRole('menuitem', { name: 'Đóng cửa vào thi…' }),
        text: 'Đóng cửa vào thi: không cho ai vào thêm, đủ điều kiện để chấm và Công bố',
      },
    ],
  });
  await examiner.getByRole('menuitem', { name: 'Đóng cửa vào thi…' }).click();
  const close = examiner.getByRole('dialog', { name: 'Đóng cửa vào thi' });
  await shot(examiner, 'nguoi-ra-de', '69-dong-cua-vao-thi', {
    marks: [
      {
        at: close.getByRole('button', { name: /^Đóng cửa/ }).last(),
        text: 'Xác nhận Đóng cửa vào thi',
      },
    ],
  });
  await close
    .getByRole('button', { name: /^Đóng cửa/ })
    .last()
    .click();
});
