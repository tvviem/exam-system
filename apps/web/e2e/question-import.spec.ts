import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function createTopic(page: Page, name: string) {
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Quản lý Chủ đề' }).click();
  const manager = page.getByRole('dialog');
  await manager.getByLabel('Tên Chủ đề').fill(name);
  await manager.getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(manager.getByText(name)).toBeVisible();
  await manager.getByRole('button', { name: 'Đóng', exact: true }).last().click();
}

const HEADER =
  'Nội dung,Phương án A,Phương án B,Phương án C,Phương án D,Phương án E,Phương án F,Đáp án,Điểm,Quy tắc chấm,Tags';
const line = (...cells: string[]) => cells.map((c) => `"${c.replaceAll('"', '""')}"`).join(',');

/** Ba dòng hợp lệ, một dòng lỗi (đáp án không có thật), một dòng trùng dòng đầu. */
const csv = Buffer.from(
  [
    HEADER,
    line('Giá trị của $2^3$ là?', '6', '8', '9', '', '', '', 'B', '', '', 'Lũy thừa'),
    line('Chọn các số nguyên tố', '2', '4', '7', '', '', '', 'A,C', '2', 'Đúng hết', ''),
    line('Một cộng một bằng?', '1', '2', '', '', '', '', 'B', '', '', ''),
    line('Dòng lỗi', 'a', 'b', '', '', '', '', 'E', '', '', ''),
    line('Giá trị của $2^3$ là?', '6', '8', '9', '', '', '', 'B', '', '', ''),
  ].join('\n'),
  'utf8',
);

test('nhập câu hỏi từ Excel: tải lên, xem trước, bỏ chọn một dòng, tạo, rồi thấy trong Chủ đề', async ({
  page,
}, testInfo) => {
  await signIn(page, `e2e-nx-${testInfo.project.name}`);
  await createTopic(page, 'Số học');

  await page.getByRole('link', { name: 'Nhập từ Excel' }).click();
  await expect(
    page.getByRole('heading', { name: 'Nhập câu hỏi từ Excel', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tải file mẫu' })).toHaveAttribute('download', '');

  await page.getByLabel('Chủ đề', { exact: true }).selectOption({ label: 'Số học' });
  await page
    .getByLabel('File câu hỏi (.xlsx hoặc .csv)')
    .setInputFiles({ name: 'cau-hoi.csv', mimeType: 'text/csv', buffer: csv });
  await page.getByRole('button', { name: 'Tải lên và xem trước' }).click();

  // Xem trước: 3 hợp lệ, 1 nghi trùng, 1 lỗi.
  await expect(page.getByRole('button', { name: /^Hợp lệ \(3\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Nghi trùng \(1\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lỗi \(1\)/ })).toBeVisible();
  await expect(page.getByText('Đã chọn 3 dòng')).toBeVisible();
  const create = page.getByRole('button', { name: 'Tạo 3 câu hỏi' });
  await expect(create).toBeEnabled();

  // Lọc dòng lỗi: thấy lý do bằng tiếng Việt và không có ô chọn.
  await page.getByRole('button', { name: /^Lỗi \(1\)/ }).click();
  // Danh sách có cả thẻ (điện thoại) và bảng (máy tính), chỉ một bên hiện.
  await expect(
    page
      .getByText('Đáp án trống, lặp hoặc không khớp Phương án có thật.')
      .locator('visible=true')
      .first(),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Tất cả/ }).click();

  // Bỏ chọn dòng "Một cộng một": còn 2.
  const row4 = page.getByRole('checkbox', { name: 'Chọn dòng 4' });
  await row4.click();
  await expect(row4).not.toBeChecked();
  await expect(page.getByText('Đã chọn 2 dòng')).toBeVisible();

  // Xem một dòng: công thức hiện ra, đáp án đúng được đánh dấu.
  await page.getByRole('button', { name: 'Xem dòng 2' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Dòng 2' });
  await expect(dialog.locator('.katex').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).first().click();

  await page.getByRole('button', { name: 'Tạo 2 câu hỏi' }).click();
  await expect(page.getByText('Đã tạo 2 câu hỏi')).toBeVisible();

  // Sau khi tạo: xem câu trong Chủ đề.
  await page.getByRole('link', { name: 'Xem câu hỏi trong Chủ đề' }).click();
  await expect(
    page.getByText('Chọn các số nguyên tố').locator('visible=true').first(),
  ).toBeVisible();
  await expect(page.getByText('Một cộng một bằng?').locator('visible=true')).toHaveCount(0);

  // Lô nằm trong danh sách gần đây, trạng thái "Đã tạo".
  await page.goto('/examiner/questions/import');
  await expect(page.getByText('đã tạo 2 câu')).toBeVisible();
});

test('file thiếu cột bắt buộc: báo lỗi rõ và cho tải file khác', async ({ page }, testInfo) => {
  await signIn(page, `e2e-nx-${testInfo.project.name}`);
  await createTopic(page, 'Hình học');
  await page.goto('/examiner/questions/import');
  await page.getByLabel('Chủ đề', { exact: true }).selectOption({ label: 'Hình học' });
  await page.getByLabel('File câu hỏi (.xlsx hoặc .csv)').setInputFiles({
    name: 'sai.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Nội dung,Phương án A\nx,y', 'utf8'),
  });
  await page.getByRole('button', { name: 'Tải lên và xem trước' }).click();
  await expect(page.getByText(/Thiếu cột bắt buộc/)).toBeVisible();
  await page.getByRole('link', { name: 'Tải file khác' }).click();
  await expect(
    page.getByRole('heading', { name: 'Nhập câu hỏi từ Excel', level: 1 }),
  ).toBeVisible();
});

for (const width of [360, 768, 1024, 1440]) {
  test(`trang nhập Excel và màn xem trước không cuộn ngang ở ${width} px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, `e2e-nx-${testInfo.project.name}`);
    await createTopic(page, `Chủ đề ${width}`);
    await page.goto('/examiner/questions/import');
    await page.getByLabel('Chủ đề', { exact: true }).selectOption({ label: `Chủ đề ${width}` });
    await page
      .getByLabel('File câu hỏi (.xlsx hoặc .csv)')
      .setInputFiles({ name: 'cau-hoi.csv', mimeType: 'text/csv', buffer: csv });
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow(), 'trang tải lên').toBe(0);
    await page.getByRole('button', { name: 'Tải lên và xem trước' }).click();
    await expect(page.getByText('Đã chọn 3 dòng')).toBeVisible();
    expect(await overflow(), 'màn xem trước').toBe(0);
  });
}
