import { expect, test } from '@playwright/test';
import { openPage, readState, shot, signIn } from './support';

// Quản trị viên: Ủy quyền chấm; Người ra đề: Xem thử Phiên thi (tài liệu quan-tri-vien.md, nguoi-ra-de.md).

test('Ủy quyền chấm (Quản trị viên) và Xem thử Phiên thi (Người ra đề)', async ({ browser }) => {
  const admin = await openPage(browser, 'desktop');
  await signIn(admin, 'quantri');
  await admin.goto('/admin/grading-delegates');
  await admin.getByLabel('Tìm Phiên thi theo tên').fill('Kiểm tra giữa kỳ');
  const row = admin.getByRole('listitem').filter({ hasText: 'Kiểm tra giữa kỳ' }).first();
  await expect(row).toBeVisible();
  await shot(admin, 'quan-tri', '18-uy-quyen-cham', {
    marks: [
      { at: admin.getByLabel('Tìm Phiên thi theo tên'), text: 'Tìm Phiên thi cần ủy quyền chấm' },
      {
        at: row.getByRole('button', { name: 'Ủy quyền' }),
        text: 'Bấm Ủy quyền để chọn người chấm thay',
      },
    ],
  });
  await row.getByRole('button', { name: 'Ủy quyền' }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel('Tìm Người ra đề').fill('Lê Quốc Hùng');
  await expect(dialog.getByRole('button', { name: 'Ủy quyền', exact: true }).first()).toBeVisible();
  await shot(admin, 'quan-tri', '19-chon-nguoi-cham-thay', {
    marks: [
      { at: dialog.getByLabel('Tìm Người ra đề'), text: 'Tìm Người ra đề sẽ chấm thay' },
      {
        at: dialog.getByRole('button', { name: 'Ủy quyền', exact: true }).first(),
        text: 'Bấm Ủy quyền',
      },
    ],
  });
  await dialog.getByRole('button', { name: 'Ủy quyền', exact: true }).first().click();
  await expect(dialog.getByText('Đang ủy quyền cho')).toBeVisible();
  await shot(admin, 'quan-tri', '20-da-uy-quyen');
  await admin.keyboard.press('Escape');

  // Người ra đề: Xem thử Phiên thi
  const examiner = await openPage(browser, 'desktop');
  await signIn(examiner, 'tran.mai');
  const sessionPath = new URL(readState().sessionUrl).pathname;
  await examiner.goto(sessionPath);
  await examiner.getByRole('link', { name: 'Xem thử' }).click();
  await expect(examiner.getByText(/Đang xem thử/)).toBeVisible();
  await shot(examiner, 'nguoi-ra-de', '59-xem-thu-phien-thi', {
    marks: [
      {
        at: examiner.getByText(/Đang xem thử/).first(),
        text: 'Dải báo Xem thử: làm thử không ghi gì lên hệ thống',
      },
      {
        at: examiner.getByRole('button', { name: 'Kết thúc xem thử' }),
        text: 'Kết thúc xem thử để quay về Phiên thi',
      },
    ],
  });
});
