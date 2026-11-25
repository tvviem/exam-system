import { expect, test } from '@playwright/test';
import { openPage, shot, signIn } from './support';

// Quản trị viên: thông báo, duyệt Yêu cầu cấp tài khoản (tài liệu quan-tri-vien.md).

test('Quản trị viên duyệt Yêu cầu cấp tài khoản', async ({ browser }) => {
  const page = await openPage(browser, 'desktop');
  await signIn(page, 'quantri');
  await page.getByRole('button', { name: /^Thông báo \(\d+ chưa đọc\)$/ }).click();
  const bell = page.getByRole('dialog');
  await shot(page, 'quan-tri', '06-chuong-thong-bao', {
    marks: [
      {
        at: bell.getByRole('button', { name: /gửi yêu cầu cấp tài khoản/ }).first(),
        text: 'Thông báo có Yêu cầu mới: bấm để mở',
      },
    ],
  });
  await bell
    .getByRole('button', { name: /gửi yêu cầu cấp tài khoản/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'danh-sach-lop-CNTT-K26.csv' })).toBeVisible();
  await shot(page, 'quan-tri', '07-xem-yeu-cau', { full: true });
  await page.setViewportSize({ width: 1280, height: 1080 }); // đủ cao để thanh Duyệt nổi nằm trong khung ảnh
  const approve = page.getByRole('button', { name: /^Duyệt \d+ dòng sẵn sàng/ });
  await shot(page, 'quan-tri', '07-xem-yeu-cau', {
    full: true,
    marks: [
      {
        at: page.getByText('Sẵn sàng duyệt').first(),
        text: 'Nhóm Sẵn sàng duyệt: người mới hoặc khớp tài khoản có sẵn',
      },
      {
        at: page.getByText('Không duyệt được').first(),
        text: 'Nhóm Không duyệt được: dòng lỗi (ví dụ thiếu họ tên), xem lý do trong bảng',
      },
      { at: approve, text: 'Bấm Duyệt để tạo tài khoản cho các dòng sẵn sàng' },
    ],
  });
  await approve.click();
  const confirm = page.getByRole('dialog');
  if (await confirm.isVisible().catch(() => false)) {
    await shot(page, 'quan-tri', '08-xac-nhan-duyet', { toast: true });
    await confirm.getByRole('button', { name: /Duyệt/ }).last().click();
  }
  await expect(page.getByText(/Đã duyệt|Duyệt một phần/).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, 'quan-tri', '09-da-duyet', { toast: true });
});
