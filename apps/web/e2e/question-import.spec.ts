import { expect, type Page, test } from '@playwright/test';
import { workbook, XLSX_MIME } from './xlsx';

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

const choiceHeader = [
  'Nội dung',
  'Phương án A',
  'Phương án B',
  'Phương án C',
  'Đáp án',
  'Điểm',
  'Quy tắc chấm',
  'Tags',
];

/**
 * Bảy dòng ở bốn sheet: năm hợp lệ, một lỗi (đáp án không có thật), một trùng dòng đầu của sheet "Chọn một".
 * Số dòng tính trong từng sheet: "Chọn một" có dòng 2 đến 5.
 */
const mixed = () =>
  workbook({
    'Chọn một': [
      choiceHeader,
      ['Giá trị của $2^3$ là?', '6', '8', '9', 'B', '', '', 'Lũy thừa'],
      ['Một cộng một bằng?', '1', '2', '', 'B', '', '', ''],
      ['Dòng lỗi', 'a', 'b', '', 'E', '', '', ''],
      ['Giá trị của $2^3$ là?', '6', '8', '9', 'B', '', '', ''],
    ],
    'Chọn nhiều': [
      choiceHeader,
      ['Chọn các số nguyên tố', '2', '4', '7', 'A,C', '2', 'Đúng hết', ''],
    ],
    'Chùm đúng sai': [
      ['Nội dung', 'Mệnh đề a', 'Mệnh đề b', 'Đáp án', 'Điểm', 'Quy tắc chấm'],
      ['Xét các số tự nhiên:', '$2$ là số chẵn', '$9$ là số nguyên tố', 'Đ,S', '1', 'Tỷ lệ'],
    ],
    'Tự luận': [
      ['Nội dung', 'Độ dài tối đa', 'Hướng dẫn chấm', 'Điểm'],
      ['Trình bày khái niệm số nguyên tố.', '500', 'Nêu đúng định nghĩa', '2'],
    ],
  });

const upload = async (page: Page, name: string, buffer: Buffer) => {
  await page
    .getByLabel('File câu hỏi (.xlsx)')
    .setInputFiles({ name, mimeType: XLSX_MIME, buffer });
  await page.getByRole('button', { name: 'Tải lên và xem trước' }).click();
};

test('nhập câu hỏi từ Excel bốn sheet: tải lên, xem trước, lọc theo loại, bỏ chọn một dòng, tạo', async ({
  page,
}, testInfo) => {
  await signIn(page, `e2e-nx-${testInfo.project.name}`);
  await createTopic(page, 'Số học');

  await page.getByRole('link', { name: 'Nhập từ Excel' }).click();
  await expect(
    page.getByRole('heading', { name: 'Nhập câu hỏi từ Excel', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tải file mẫu trống' })).toHaveAttribute(
    'download',
    '',
  );
  await expect(page.getByRole('link', { name: 'Tải file ví dụ (8 câu)' })).toHaveAttribute(
    'download',
    '',
  );

  await page.getByLabel('Chủ đề', { exact: true }).selectOption({ label: 'Số học' });
  await upload(page, 'cau-hoi.xlsx', await mixed());

  // Xem trước: 5 hợp lệ, 1 nghi trùng, 1 lỗi.
  await expect(page.getByRole('button', { name: /^Hợp lệ \(5\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Nghi trùng \(1\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lỗi \(1\)/ })).toBeVisible();
  await expect(page.getByText('Đã chọn 5 dòng')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo 5 câu hỏi' })).toBeEnabled();

  // Lọc theo loại: chỉ hiện khi lô có từ hai loại trở lên.
  await expect(page.getByRole('button', { name: /^Chọn một \(4\)/ })).toBeVisible();
  await page.getByRole('button', { name: /^Tự luận \(1\)/ }).click();
  await expect(
    page.getByText('Trình bày khái niệm số nguyên tố.').locator('visible=true').first(),
  ).toBeVisible();
  await expect(page.getByText('Một cộng một bằng?').locator('visible=true')).toHaveCount(0);
  await page.getByRole('button', { name: /^Mọi loại/ }).click();

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

  // Bỏ chọn dòng "Một cộng một" (dòng 3 của sheet "Chọn một"): còn 4.
  const row3 = page.getByRole('checkbox', { name: 'Chọn dòng 3 (Chọn một)' });
  await row3.click();
  await expect(row3).not.toBeChecked();
  await expect(page.getByText('Đã chọn 4 dòng')).toBeVisible();

  // Xem một dòng: công thức hiện ra, đáp án đúng được đánh dấu.
  await page.getByRole('button', { name: 'Xem dòng 2 (Chọn một)' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Chọn một · dòng 2' });
  await expect(dialog.locator('.katex').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).first().click();

  await page.getByRole('button', { name: 'Tạo 4 câu hỏi' }).click();
  await expect(page.getByText('Đã tạo 4 câu hỏi')).toBeVisible();

  // Sau khi tạo: thấy câu trong Chủ đề (cả chùm và tự luận), không thấy câu đã bỏ chọn.
  await page.getByRole('link', { name: 'Xem câu hỏi trong Chủ đề' }).click();
  for (const text of ['Chọn các số nguyên tố', 'Xét các số tự nhiên:', 'Trình bày khái niệm']) {
    await expect(page.getByText(text).locator('visible=true').first()).toBeVisible();
  }
  await expect(page.getByText('Một cộng một bằng?').locator('visible=true')).toHaveCount(0);

  // Lô nằm trong danh sách gần đây, mở lại vẫn thấy kết quả.
  await page.goto('/examiner/questions/import');
  await expect(page.getByText('đã tạo 4 câu')).toBeVisible();
  await page
    .getByRole('link', { name: /cau-hoi\.xlsx/ })
    .first()
    .click();
  await expect(page.getByText('Đã tạo 4 câu hỏi')).toBeVisible();
});

test('file ví dụ tải từ hệ thống nhập được nguyên vẹn: 8 câu, mỗi loại 2 câu', async ({
  page,
}, testInfo) => {
  await signIn(page, `e2e-nx-${testInfo.project.name}`);
  await createTopic(page, 'Ví dụ');
  await page.goto('/examiner/questions/import');
  await page.getByLabel('Chủ đề', { exact: true }).selectOption({ label: 'Ví dụ' });

  const example = await page.request.get('/api/question-imports/example');
  expect(example.ok()).toBe(true);
  await upload(page, 'vi-du-nhap-cau-hoi.xlsx', await example.body());

  await expect(page.getByRole('button', { name: /^Hợp lệ \(8\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lỗi \(0\)/ })).toBeVisible();
  for (const type of ['Chọn một', 'Chọn nhiều', 'Chùm đúng/sai', 'Tự luận']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${type} \\(2\\)`) })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Tạo 8 câu hỏi' }).click();
  await expect(page.getByText('Đã tạo 8 câu hỏi')).toBeVisible();
});

test('hủy lô đang chờ xác nhận rồi tải lại file đã sửa', async ({ page }, testInfo) => {
  await signIn(page, `e2e-nx-${testInfo.project.name}`);
  await createTopic(page, 'Hủy lô');
  await page.goto('/examiner/questions/import');
  await page.getByLabel('Chủ đề', { exact: true }).selectOption({ label: 'Hủy lô' });
  await upload(page, 'sai-noi-dung.xlsx', await mixed());
  await expect(page.getByText('Đã chọn 5 dòng')).toBeVisible();

  // Hủy: hộp xác nhận có thể từ chối; xác nhận thì về trang tải lên với Chủ đề đã chọn sẵn.
  await page.getByRole('button', { name: 'Hủy lô' }).click();
  const dialog = page.getByRole('dialog', { name: 'Hủy lô nhập này?' });
  await dialog.getByRole('button', { name: 'Giữ lại' }).click();
  await expect(page.getByText('Đã chọn 5 dòng')).toBeVisible();
  await page.getByRole('button', { name: 'Hủy lô' }).click();
  await page
    .getByRole('dialog', { name: 'Hủy lô nhập này?' })
    .getByRole('button', { name: 'Hủy lô' })
    .click();

  await expect(
    page.getByRole('heading', { name: 'Nhập câu hỏi từ Excel', level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel('Chủ đề', { exact: true })).toHaveValue(/.+/);
  await expect(page.getByRole('link', { name: /sai-noi-dung\.xlsx/ })).toHaveCount(0);

  // Tải lên lại file đã sửa: nhập bình thường.
  await upload(page, 'da-sua.xlsx', await mixed());
  await expect(page.getByText('Đã chọn 5 dòng')).toBeVisible();
});

test('file có sheet lạ: báo tên sheet, hủy lô đọc lỗi từ danh sách gần đây', async ({
  page,
}, testInfo) => {
  await signIn(page, `e2e-nx-${testInfo.project.name}`);
  await createTopic(page, 'Hình học');
  await page.goto('/examiner/questions/import');
  await page.getByLabel('Chủ đề', { exact: true }).selectOption({ label: 'Hình học' });
  await upload(page, 'sheet-la.xlsx', await workbook({ 'Câu hỏi': [['Nội dung'], ['x']] }));
  await expect(page.getByText(/File có sheet “Câu hỏi” không thuộc mẫu/)).toBeVisible();
  await page.getByRole('link', { name: 'Tải file khác' }).click();

  // Lô đọc lỗi nằm trong danh sách gần đây và hủy được.
  const item = page.getByRole('listitem').filter({ hasText: 'sheet-la.xlsx' });
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Hủy lô' }).click();
  await page
    .getByRole('dialog', { name: 'Hủy lô nhập này?' })
    .getByRole('button', { name: 'Hủy lô' })
    .click();
  await expect(page.getByRole('listitem').filter({ hasText: 'sheet-la.xlsx' })).toHaveCount(0);
});

test('file thiếu cột bắt buộc: báo rõ sheet nào', async ({ page }, testInfo) => {
  await signIn(page, `e2e-nx-${testInfo.project.name}`);
  await createTopic(page, 'Đại số');
  await page.goto('/examiner/questions/import');
  await page.getByLabel('Chủ đề', { exact: true }).selectOption({ label: 'Đại số' });
  await upload(
    page,
    'thieu-cot.xlsx',
    await workbook({
      'Chọn một': [
        ['Nội dung', 'Phương án A'],
        ['x', 'y'],
      ],
    }),
  );
  await expect(page.getByText(/Sheet “Chọn một” thiếu cột bắt buộc/)).toBeVisible();
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
      .getByLabel('File câu hỏi (.xlsx)')
      .setInputFiles({ name: 'cau-hoi.xlsx', mimeType: XLSX_MIME, buffer: await mixed() });
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow(), 'trang tải lên').toBe(0);
    await page.getByRole('button', { name: 'Tải lên và xem trước' }).click();
    await expect(page.getByText('Đã chọn 5 dòng')).toBeVisible();
    expect(await overflow(), 'màn xem trước').toBe(0);
    await page.getByRole('button', { name: 'Tạo 5 câu hỏi' }).click();
    await expect(page.getByText('Đã tạo 5 câu hỏi')).toBeVisible();
    expect(await overflow(), 'màn kết quả').toBe(0);
  });
}
