import { expect, test } from '@playwright/test';
import { openPage, readState, shot, signIn } from './support';

// Sau giờ thi: Xuất Bộ đề, Kết quả, chấm tự luận, Vi phạm, Thống kê câu, Công bố (tài liệu nguoi-ra-de.md).

test('Kết quả, chấm tự luận, Vi phạm, Thống kê câu, Công bố', async ({ browser }) => {
  test.setTimeout(900_000);
  const examiner = await openPage(browser, 'desktop');
  await signIn(examiner, 'tran.mai');
  const sessionPath = new URL(readState().sessionUrl).pathname;

  // Xuất Bộ đề của Phiên thi
  await examiner.goto(sessionPath);
  await examiner.getByRole('button', { name: 'Xuất Bộ đề' }).click();
  await shot(examiner, 'nguoi-ra-de', '70-xuat-bo-de', {});
  await examiner.keyboard.press('Escape');

  // Trang Kết quả
  await examiner.goto(`${sessionPath}/results`);
  await expect(
    examiner.getByRole('heading', { name: 'Kiểm tra giữa kỳ - Lớp CNTT-K26', level: 1 }),
  ).toBeVisible();
  await examiner.waitForTimeout(1500);
  await shot(examiner, 'nguoi-ra-de', '71-ket-qua-truoc-cham', {
    full: true,
    marks: [
      {
        at: examiner.getByRole('link', { name: /^Chấm tự luận/ }),
        text: 'Chấm tự luận: số bài còn chờ chấm ghi trong ngoặc',
      },
      {
        at: examiner.getByRole('button', { name: /^Chấm ẩn tên/ }),
        text: 'Chấm ẩn tên: che tên người làm bài để chấm công bằng',
      },
      {
        at: examiner.getByRole('button', { name: 'Công bố kết quả' }),
        text: 'Công bố kết quả (sáng lên khi đã chấm xong)',
      },
    ],
  });

  // Chấm tự luận: chấm hết từng bài bằng nút điểm nhanh
  await examiner.getByRole('link', { name: /^Chấm tự luận/ }).click();
  await expect(examiner.getByTestId('answer')).toBeVisible();
  await shot(examiner, 'nguoi-ra-de', '72-cham-tu-luan', {
    marks: [
      {
        at: examiner.getByTestId('answer'),
        text: 'Bài làm của người dự thi (ẩn tên: chỉ thấy "Bài 17")',
      },
      {
        at: examiner.getByTestId('quick-3'),
        text: 'Nút điểm nhanh: 0, một nửa hoặc tối đa; có thể nhập điểm thủ công',
      },
    ],
  });
  let misses = 0;
  for (let i = 0; i < 300 && misses < 25; i++) {
    const quick = examiner.getByTestId(i % 3 === 0 ? 'quick-5' : 'quick-3');
    const next = examiner.getByRole('button', { name: /^Sang Câu/ });
    // Hết bài của một Câu thì nút "Sang Câu …" hiện ra (các nút điểm vẫn còn): ưu tiên sang Câu kế.
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      misses = 0;
    } else if (await quick.isVisible().catch(() => false)) {
      await quick.click();
      misses = 0;
    } else {
      misses++;
    }
    await examiner.waitForTimeout(150);
  }
  await shot(examiner, 'nguoi-ra-de', '73-cham-xong', { toast: true });
  await examiner.goto(`${sessionPath}/results`);

  // Vi phạm: Mức xử lý
  await expect(examiner.getByRole('tab', { name: /^Vi phạm/ })).toBeVisible();
  await examiner.getByRole('tab', { name: /^Vi phạm/ }).click();
  await shot(examiner, 'nguoi-ra-de', '74-vi-pham-muc-xu-ly', {
    full: true,
    marks: [
      {
        at: examiner.getByLabel('Phần trăm bị trừ').first(),
        text: 'Chọn Mức xử lý: Không xử lý, Trừ điểm theo phần trăm hoặc Hủy kết quả',
      },
    ],
  });
  await examiner.getByLabel('Phần trăm bị trừ').first().fill('10');
  await examiner.getByRole('button', { name: 'Trừ', exact: true }).first().click();
  await expect(examiner.getByText('Đã lưu Mức xử lý').first()).toBeVisible();

  // Thống kê câu và Đính chính đáp án
  await examiner.getByRole('tab', { name: 'Thống kê câu' }).click();
  await examiner.waitForTimeout(800);
  await shot(examiner, 'nguoi-ra-de', '75-thong-ke-cau', { full: true });
  await examiner
    .getByRole('button', { name: /Đính chính câu này/ })
    .first()
    .click()
    .catch(() => {});
  if (
    await examiner
      .getByRole('dialog')
      .isVisible()
      .catch(() => false)
  ) {
    await shot(examiner, 'nguoi-ra-de', '76-dinh-chinh-dap-an');
    await examiner.keyboard.press('Escape');
  }

  // Bảng người dự thi và Công bố
  await examiner.getByRole('tab', { name: 'Người dự thi' }).click();
  await examiner.waitForTimeout(500);
  await shot(examiner, 'nguoi-ra-de', '77-ket-qua-sau-cham', {
    full: true,
    marks: [
      { at: examiner.getByRole('button', { name: 'Công bố kết quả' }), text: 'Công bố kết quả' },
      { at: examiner.getByRole('link', { name: 'Xuất Excel' }), text: 'Xuất bảng điểm ra Excel' },
    ],
  });
  await examiner.getByRole('button', { name: 'Công bố kết quả' }).click();
  const dialog = examiner.getByRole('dialog', { name: 'Công bố kết quả' });
  await shot(examiner, 'nguoi-ra-de', '78-cong-bo-ket-qua', {
    marks: [
      {
        at: dialog.getByLabel('Thời hạn Phúc khảo'),
        text: 'Chọn Thời hạn Phúc khảo (0 đến 14 ngày; 0 là không nhận Phúc khảo)',
      },
      {
        at: dialog.getByRole('button', { name: 'Công bố', exact: true }),
        text: 'Bấm Công bố (không thu hồi được)',
      },
    ],
  });
  await dialog.getByRole('button', { name: 'Công bố', exact: true }).click();
  await expect(examiner.getByText(/Đã Công bố lúc .* · Phúc khảo đến/)).toBeVisible();
  await shot(examiner, 'nguoi-ra-de', '79-da-cong-bo', { full: true });
});
