import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

test('Người ra đề tải file mẫu và gửi yêu cầu; Quản trị viên nhận thông báo, xem bảng dòng rồi Từ chối', async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const examinerName = `Giảng viên E2E ${project}`;

  // --- Người ra đề ---
  await signIn(page, `e2e-yc-gv-${project}`);
  await expect(page).toHaveURL(/\/examiner\/account-requests/);
  await expect(
    page.getByRole('heading', { name: 'Yêu cầu cấp tài khoản', level: 1 }),
  ).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Tải file mẫu' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);

  const csv = [
    'Họ tên,Mã định danh,Email,Lớp,Ngày sinh,Giới tính',
    `Nguyễn Văn An,E2E-${project}-1,,CNTT-K21,15/03/2005,Nam`,
    `Trần Thị Bình,E2E-${project}-2,,CNTT-K21,,Nữ`,
    `,E2E-${project}-3,,,,`, // thiếu họ tên: dòng lỗi
  ].join('\n');
  await page.getByLabel('File danh sách').setInputFiles({
    name: `lop-${project}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByLabel('Ghi chú').fill('Lớp CNTT-K21');
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();

  // Trang chi tiết tự cập nhật khi worker đọc xong file.
  await expect(page.getByRole('heading', { name: `lop-${project}.csv` })).toBeVisible();
  await expect(page.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('3 dòng').first()).toBeVisible();
  await page.getByRole('button', { name: /Không duyệt được \(1\)/ }).click();
  // Danh sách có hai bố cục (thẻ và bảng), mỗi cỡ màn hình chỉ hiện một.
  await expect(page.getByText('Thiếu họ tên.').filter({ visible: true })).toBeVisible();

  // --- Quản trị viên ---
  const admin = await browser.newPage();
  await signIn(admin, `e2e-yc-qt-${project}`);
  await expect(admin.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
  await admin.getByRole('button', { name: /^Thông báo \(\d+ chưa đọc\)$/ }).click();
  const dialog = admin.getByRole('dialog');
  await dialog
    .getByRole('button', {
      name: new RegExp(`${examinerName} gửi yêu cầu cấp tài khoản \\(3 dòng\\)`),
    })
    .click();
  await expect(admin.getByRole('heading', { name: `lop-${project}.csv` })).toBeVisible();
  await expect(admin.getByText('Nguyễn Văn An').filter({ visible: true })).toBeVisible();

  await admin.getByRole('button', { name: 'Từ chối yêu cầu' }).click();
  await admin.getByLabel('Lý do').fill('File sai lớp');
  await admin.getByRole('dialog').getByRole('button', { name: 'Từ chối', exact: true }).click();
  await expect(admin.getByText('Đã từ chối').first()).toBeVisible();
  await expect(admin.locator('p', { hasText: 'File sai lớp' })).toBeVisible();
  await admin.close();

  // --- Người ra đề thấy kết quả ---
  // Chuông hỏi lại mỗi 60 giây hoặc khi quay lại tab (Q95); tải lại trang thay cho việc chờ.
  await page.reload();
  await page.getByRole('link', { name: 'Danh sách yêu cầu' }).click();
  await page.getByRole('button', { name: /^Thông báo \(\d+ chưa đọc\)$/ }).click();
  await expect(
    page.getByRole('dialog').getByText('Yêu cầu cấp tài khoản của bạn đã bị từ chối.'),
  ).toBeVisible();
});

test('Quản trị viên duyệt yêu cầu; Phiếu tài khoản PDF và Excel tải được cho cả Quản trị viên lẫn Người ra đề', async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const fileName = `duyet-${project}.csv`;
  const csv = [
    'Họ tên,Mã định danh,Email,Lớp,Ngày sinh,Giới tính',
    `Phạm Văn Một,E2E-D-${project}-1,,CNTT-K22,01/02/2006,Nam`,
    `Lê Thị Hai,E2E-D-${project}-2,,CNTT-K22,,Nữ`,
  ].join('\n');

  // Người ra đề gửi yêu cầu.
  await signIn(page, `e2e-yc-gv-${project}`);
  await page.getByLabel('File danh sách').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(page.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 15_000 });

  // Quản trị viên duyệt cả lô hợp lệ.
  const admin = await browser.newPage();
  await signIn(admin, `e2e-yc-qt-${project}`);
  await expect(admin.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
  await admin.goto('/admin/account-requests');
  await admin.getByRole('link', { name: new RegExp(fileName) }).click();
  await admin.getByRole('button', { name: /^Duyệt các dòng hợp lệ \(2\)$/ }).click();
  await expect(admin.getByText('Đã duyệt', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(admin.getByRole('heading', { name: 'Phiếu tài khoản' })).toBeVisible();
  await expect(admin.getByText('2 tài khoản')).toBeVisible();

  // Tải PDF: file hợp lệ và đã được giải mã.
  const pdfDownload = admin.waitForEvent('download');
  await admin.getByRole('link', { name: /Tải PDF/ }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toMatch(/^phieu-tai-khoan-\d{8}\.pdf$/);
  const pdfBytes = await (await import('node:fs/promises')).readFile(await pdf.path());
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');

  const xlsxDownload = admin.waitForEvent('download');
  await admin.getByRole('link', { name: /Tải Excel/ }).click();
  expect((await xlsxDownload).suggestedFilename()).toMatch(/\.xlsx$/);
  await admin.close();

  // Người ra đề cũng thấy và tải được phiếu của yêu cầu mình gửi.
  await page.reload();
  await expect(page.getByText('Đã duyệt', { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: 'Phiếu tài khoản' })).toBeVisible();
  const examinerDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: /Tải PDF/ }).click();
  expect((await examinerDownload).suggestedFilename()).toMatch(/\.pdf$/);
});
