import { expect, test } from '@playwright/test';
import { openPage, readState, shot, signIn } from './support';

// Người dự thi xem Kết quả và gửi Phúc khảo (điện thoại); Người ra đề xử lý Phúc khảo (tài liệu nguoi-du-thi.md, nguoi-ra-de.md).

test('Xem Kết quả, gửi Phúc khảo, xử lý Phúc khảo', async ({ browser }) => {
  test.setTimeout(600_000);
  const phone = await openPage(browser, 'phone');
  await signIn(phone, 'sv26001', 'mat-khau-moi-cua-an-2026');
  await expect(phone.getByRole('heading', { name: 'Vào thi', level: 1 })).toBeVisible();
  await shot(phone, 'nguoi-du-thi', '19-co-ket-qua', {
    marks: [
      {
        at: phone.getByRole('link', { name: 'Xem Kết quả' }).first(),
        text: 'Bấm Xem Kết quả (có sau khi Người ra đề Công bố)',
      },
    ],
  });
  await phone.getByRole('link', { name: 'Xem Kết quả' }).first().click();
  await expect(phone.getByTestId('result-hero')).toBeVisible();
  await shot(phone, 'nguoi-du-thi', '20-ket-qua-cua-toi', {
    full: true,
    marks: [
      {
        at: phone.getByTestId('result-hero'),
        text: 'Điểm của bạn: điểm thô, điểm tối đa và điểm quy đổi thang 10',
      },
      {
        at: phone.getByTestId('appeal-summary'),
        text: 'Số lượt Phúc khảo bạn được gửi và đã dùng',
      },
    ],
  });
  await phone
    .getByRole('button', { name: /Mở bản đồ câu/ })
    .click()
    .catch(() => {});
  const wrong = phone.getByRole('button', { name: /^Sai\s*\d+$/ }).first();
  if (await wrong.isVisible().catch(() => false)) {
    await wrong.evaluate((el) => (el as HTMLElement).click()); // bấm bằng mã trong trang: chip nằm trong khung cuộn riêng
  }
  await shot(phone, 'nguoi-du-thi', '21-ban-do-cau-va-loc-sai');
  await phone.keyboard.press('Escape');
  if (
    await phone
      .getByTestId('appeal-open')
      .isVisible()
      .catch(() => false)
  ) {
    await phone.getByTestId('appeal-open').evaluate((el) => (el as HTMLElement).click());
    const dialog = phone.getByRole('dialog');
    await dialog
      .getByLabel(/Lý do/)
      .fill('Em cho rằng đáp án em chọn cũng đúng vì câu hỏi có thể hiểu theo hai cách.');
    await shot(phone, 'nguoi-du-thi', '22-gui-phuc-khao', {
      marks: [
        {
          at: dialog.getByLabel(/Lý do/),
          text: 'Viết lý do Phúc khảo (ít nhất vài chữ, nêu rõ vì sao)',
        },
        { at: dialog.getByTestId('appeal-send'), text: 'Bấm Gửi' },
      ],
    });
    await dialog.getByTestId('appeal-send').click();
    await expect(phone.getByTestId('appeal-summary')).toContainText(/đã dùng 1\//);
    await shot(phone, 'nguoi-du-thi', '23-da-gui-phuc-khao');
  }

  // Người ra đề xử lý Phúc khảo
  const examiner = await openPage(browser, 'desktop');
  await signIn(examiner, 'tran.mai');
  const sessionPath = new URL(readState().sessionUrl).pathname;
  await examiner.goto(`${sessionPath}/results`);
  await examiner.getByRole('tab', { name: /^Phúc khảo/ }).click();
  await examiner.waitForTimeout(800);
  await shot(examiner, 'nguoi-ra-de', '80-ket-qua-tab-phuc-khao', { full: true });
  if (
    await examiner
      .getByTestId('handle-appeals')
      .isVisible()
      .catch(() => false)
  ) {
    await examiner.getByTestId('handle-appeals').click();
    await expect(examiner.getByTestId('appeal-detail')).toBeVisible();
    await examiner
      .getByLabel(/Trả lời Người dự thi/)
      .fill('Đã xem lại: giữ nguyên điểm vì phương án đúng được nêu rõ trong đề.');
    await shot(examiner, 'nguoi-ra-de', '81-xu-ly-phuc-khao', {
      marks: [
        {
          at: examiner.getByTestId('appeal-answer'),
          text: 'Câu trả lời của người dự thi và lý do Phúc khảo',
        },
        {
          at: examiner.getByLabel(/Trả lời Người dự thi/),
          text: 'Viết câu trả lời cho người dự thi (bắt buộc)',
        },
        {
          at: examiner.getByTestId('appeal-resolve'),
          text: 'Bấm để xử lý: Giữ nguyên hoặc Đặt điểm khác',
        },
      ],
    });
  }
});
