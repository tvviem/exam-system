import { expect, test } from '@playwright/test';
import { choosePickerTopic } from '../e2e/topic-support';
import { openPage, shot, signIn } from './support';

// Người ra đề: soạn Bộ đề (tài liệu nguoi-ra-de.md).

test('Soạn Bộ đề: tạo, thêm câu, Phần, điểm, rút câu, xem thử', async ({ browser }) => {
  const page = await openPage(browser, 'desktop');
  await signIn(page, 'tran.mai');
  await page.goto('/examiner/exams');
  await expect(page.getByText('Chưa có Bộ đề nào.')).toBeVisible();
  await shot(page, 'nguoi-ra-de', '30-danh-sach-bo-de-trong', {
    marks: [{ at: page.getByRole('button', { name: 'Tạo Bộ đề' }), text: 'Bấm Tạo Bộ đề' }],
  });
  await page.getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await page.getByRole('dialog').getByLabel('Tên Bộ đề').fill('Kiểm tra giữa kỳ Tin học căn bản');
  await shot(page, 'nguoi-ra-de', '31-tao-bo-de', {
    marks: [
      {
        at: page.getByRole('dialog').getByLabel('Tên Bộ đề'),
        text: 'Đặt tên Bộ đề rồi bấm Tạo Bộ đề',
      },
    ],
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await expect(
    page.getByRole('heading', { name: 'Kiểm tra giữa kỳ Tin học căn bản', level: 1 }),
  ).toBeVisible();
  await shot(page, 'nguoi-ra-de', '32-bo-de-trong', { full: true });
  // Thêm câu hỏi vào Phần 1: lọc theo Chủ đề và Loại, chọn cả trang
  const addDialog = page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
  const addFrom = async (type: string, section?: number) => {
    await page.getByRole('button', { name: 'Thêm câu hỏi' }).click();
    await expect(addDialog).toBeVisible();
    if (section !== undefined)
      await addDialog.getByLabel('Thêm vào Phần').selectOption({ index: section });
    await choosePickerTopic(addDialog, 'Tin học căn bản');
    await addDialog.getByLabel('Loại câu hỏi').selectOption({ label: type });
    await expect(addDialog.getByText(/Chọn cả \d+ câu trên trang này/)).toBeVisible();
  };
  await addFrom('Chọn một');
  await addDialog.getByText(/Chọn cả \d+ câu trên trang này/).click();
  await shot(page, 'nguoi-ra-de', '33-hop-them-cau', {
    marks: [
      {
        at: addDialog.getByRole('combobox', { name: 'Chủ đề' }),
        text: 'Chọn Chủ đề: gõ để tìm, cả chữ cái đầu',
      },
      {
        at: addDialog.getByLabel('Loại câu hỏi'),
        text: 'Lọc theo Loại câu hỏi (hoặc tìm theo nội dung)',
      },
      {
        at: addDialog.getByRole('searchbox', { name: 'Tìm tag' }),
        text: 'Lọc theo tag: tích một hay nhiều tag trong danh sách',
      },
      {
        at: addDialog.getByText(/Chọn cả \d+ câu trên trang này/),
        text: 'Chọn cả trang, hoặc tick từng câu',
      },
      {
        at: addDialog.getByRole('button', { name: /^Xem chi tiết:/ }).first(),
        text: 'Xem chi tiết câu hỏi trước khi thêm',
      },
      {
        at: addDialog.getByRole('button', { name: /^Thêm \d+ câu vào/ }),
        text: 'Bấm để thêm các câu đã chọn vào Phần',
      },
    ],
  });
  await addDialog
    .getByRole('button', { name: /^Xem chi tiết:/ })
    .first()
    .click();
  const detail = page.getByRole('dialog', { name: 'Chi tiết câu hỏi' });
  await expect(detail).toBeVisible();
  await shot(page, 'nguoi-ra-de', '34-chi-tiet-cau-hoi', {
    marks: [
      {
        at: detail.locator('[data-correct]').first(),
        text: 'Đáp án đúng được đánh dấu bằng màu và dấu ✓',
      },
    ],
  });
  await page.keyboard.press('Escape');
  await addDialog.getByRole('button', { name: /^Thêm \d+ câu vào/ }).click();
  await expect(addDialog).toBeHidden();

  await addFrom('Chọn nhiều');
  await addDialog.getByText(/Chọn cả \d+ câu trên trang này/).click();
  await addDialog.getByRole('button', { name: /^Thêm \d+ câu vào/ }).click();
  await expect(addDialog).toBeHidden();

  // Chia Phần
  await page.getByRole('button', { name: 'Chia Phần' }).click();
  await page.getByLabel('Tiêu đề Phần').first().fill('Phần I. Trắc nghiệm');
  await page.getByLabel('Tiêu đề Phần').nth(1).fill('Phần II. Đúng/sai và tự luận');
  await addFrom('Chùm đúng/sai', 1);
  await addDialog.getByText(/Chọn cả \d+ câu trên trang này/).click();
  await addDialog.getByRole('button', { name: /^Thêm \d+ câu vào/ }).click();
  await addFrom('Tự luận', 1);
  await addDialog.getByText(/Chọn cả \d+ câu trên trang này/).click();
  await addDialog.getByRole('button', { name: /^Thêm \d+ câu vào/ }).click();
  await shot(page, 'nguoi-ra-de', '35-bo-de-hai-phan', {
    full: true,
    marks: [
      { at: page.getByLabel('Tiêu đề Phần').first(), text: 'Tên Phần (sửa trực tiếp)' },
      {
        at: page.getByRole('textbox', { name: 'Điểm câu 1' }),
        text: 'Điểm của từng câu trong Bộ đề',
      },
      {
        at: page.getByRole('button', { name: 'Đặt điểm nhanh' }),
        text: 'Đặt điểm nhanh cho nhiều câu cùng lúc',
      },
    ],
  });

  // Đặt điểm nhanh cho Phần I: mỗi câu 1 điểm
  await page.getByRole('button', { name: 'Đặt điểm nhanh' }).click();
  const quick = page.getByRole('dialog', { name: 'Đặt điểm nhanh' });
  await quick.getByLabel('Áp dụng cho').selectOption('section');
  await quick.getByLabel('Phần', { exact: true }).selectOption({ index: 0 });
  await quick.getByLabel('Điểm mỗi câu').fill('1');
  await shot(page, 'nguoi-ra-de', '36-dat-diem-nhanh', {
    marks: [
      {
        at: quick.getByLabel('Áp dụng cho'),
        text: 'Áp dụng cho cả Bộ đề, một Phần hoặc các câu đã chọn',
      },
      {
        at: quick.getByLabel('Điểm mỗi câu'),
        text: 'Nhập điểm mỗi câu (hoặc chọn chia theo tổng điểm)',
      },
      { at: quick.getByRole('button', { name: 'Áp dụng' }), text: 'Bấm Áp dụng' },
    ],
  });
  await quick.getByRole('button', { name: 'Áp dụng' }).click();

  // Rút câu: Phần I rút 60 %
  await page
    .getByRole('textbox', { name: /^Tỷ lệ rút của Phần/ })
    .first()
    .fill('60');
  await expect(page.getByText(/mỗi người nhận \d+\/\d+ câu/).first()).toBeVisible();
  await shot(page, 'nguoi-ra-de', '37-rut-cau-theo-phan', {
    marks: [
      {
        at: page.getByRole('textbox', { name: /^Tỷ lệ rút của Phần/ }).first(),
        text: 'Tỷ lệ rút của Phần (ví dụ 60 %: mỗi người nhận 6 trong 10 câu của Phần)',
      },
      {
        at: page.getByText(/mỗi người nhận \d+\/\d+ câu/).first(),
        text: 'Hệ thống tính ngay số câu mỗi Người dự thi nhận',
      },
    ],
  });
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Bộ đề')).toBeVisible();
  await shot(page, 'nguoi-ra-de', '38-thanh-dinh-luu', {
    toast: true,
    marks: [
      {
        at: page.getByRole('button', { name: 'Phát hành…' }),
        text: 'Phát hành… (khi đã Lưu và kiểm xong)',
      },
    ],
  });

  // Phát hành
  await page.getByRole('button', { name: 'Phát hành…' }).click();
  const publish = page.getByRole('dialog', { name: 'Phát hành Bộ đề' });
  await expect(publish).toBeVisible();
  await shot(page, 'nguoi-ra-de', '39-hop-phat-hanh', {
    marks: [
      {
        at: publish.getByTestId('publish-draw'),
        text: 'Bảng từng Phần: số câu, tỷ lệ rút, số câu mỗi người nhận',
      },
      {
        at: publish.getByRole('button', { name: /^Phát hành/ }).last(),
        text: 'Xác nhận Phát hành (không thu hồi được)',
      },
    ],
  });
  await publish
    .getByRole('button', { name: /^Phát hành/ })
    .last()
    .click();
  await expect(page.getByText('Đã phát hành', { exact: true }).first()).toBeVisible();
  await shot(page, 'nguoi-ra-de', '40-bo-de-da-phat-hanh', {
    full: true,
    marks: [
      {
        at: page.getByTestId('exam-overview'),
        text: 'Thẻ tổng quan: tổng số câu, điểm, mỗi người nhận bao nhiêu, bảng các Phần',
      },
      { at: page.getByTestId('exam-filter'), text: 'Lọc câu hỏi theo nội dung hoặc tag' },
    ],
  });
});
