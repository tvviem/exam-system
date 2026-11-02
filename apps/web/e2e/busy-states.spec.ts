import { expect, type Page, test } from '@playwright/test';
import { workbook, XLSX_MIME } from './xlsx';

// Tác vụ nặng (tải file, server đọc file) phải báo rõ "đang xử lý": biểu tượng quay, nút aria-busy,
// vùng role=status nêu tên file và dặn có thể rời trang. Chờ lâu được mô phỏng bằng cách làm chậm yêu cầu.

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('Yêu cầu cấp tài khoản: tải lên và server đọc file đều báo đang xử lý', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-yc-gv-${p}`);
  await page.goto('/examiner/account-requests');

  await page.route('**/api/account-requests', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await delay(1500);
    return route.continue();
  });
  // Chi tiết yêu cầu vừa tạo: giữ ở "đang đọc file" thêm vài giây như khi file nhiều dòng.
  const until = Date.now() + 5000;
  await page.route(/\/api\/account-requests\/[0-9a-f-]{36}$/, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    return route.fulfill({
      response: res,
      json: Date.now() < until ? { ...body, status: 'parsing' } : body,
    });
  });

  const csv = [
    'Họ tên,Mã định danh,Email,Lớp,Ngày sinh,Giới tính',
    `Bận ${p},BUSY-${p}-1,,K1,,Nam`,
  ].join('\n');
  await page.getByLabel('File danh sách').setInputFiles({
    name: `ban-${p}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  const submit = page.getByRole('button', { name: /Đang gửi|Gửi yêu cầu/ });
  await submit.click();

  // Đang tải lên: nút bận kèm biểu tượng quay, vùng trạng thái nêu tên file
  await expect(submit).toHaveAttribute('aria-busy', 'true');
  await expect(submit.locator('[data-spinner]')).toBeVisible();
  const uploading = page.getByRole('status').filter({ hasText: `ban-${p}.csv` });
  await expect(uploading).toBeVisible();
  await expect(uploading.locator('[data-spinner]')).toBeVisible();

  // Server đang đọc file: biểu tượng quay và lời dặn có thể rời trang
  const parsing = page.getByRole('status').filter({ hasText: 'Hệ thống đang đọc file' });
  await expect(parsing).toBeVisible();
  await expect(parsing.locator('[data-spinner]')).toBeVisible();
  await expect(parsing).toContainText('có thể rời trang');

  // Xong thì chỉ báo biến mất
  await expect(page.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-spinner]')).toHaveCount(0);
});

test('Nhập Excel Câu hỏi: tải lên báo tên file và dung lượng, nút bận kèm biểu tượng quay', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-nx-${p}`);
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Quản lý Chủ đề' }).click();
  const manager = page.getByRole('dialog');
  await manager.getByLabel('Tên Chủ đề').fill(`Chủ đề bận ${p}`);
  await manager.getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(manager.getByText(`Chủ đề bận ${p}`)).toBeVisible();
  await manager.getByRole('button', { name: 'Đóng', exact: true }).last().click();

  await page.goto('/examiner/questions/import');
  await page.route('**/api/question-imports', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await delay(1500);
    return route.continue();
  });
  await page.locator('#import-topic').selectOption({ label: `Chủ đề bận ${p}` });
  const header = [
    'Nội dung',
    'Phương án A',
    'Phương án B',
    'Phương án C',
    'Đáp án',
    'Điểm',
    'Quy tắc chấm',
    'Tags',
  ];
  await page.getByLabel('File câu hỏi').setInputFiles({
    name: `cau-hoi-${p}.xlsx`,
    mimeType: XLSX_MIME,
    buffer: await workbook({
      'Chọn một': [header, [`Câu bận ${p}`, 'a', 'b', '', 'A', '', '', '']],
    }),
  });
  const submit = page.getByRole('button', { name: /Đang tải lên|Tải lên và xem trước/ });
  await submit.click();

  await expect(submit).toHaveAttribute('aria-busy', 'true');
  await expect(submit.locator('[data-spinner]')).toBeVisible();
  const uploading = page.getByRole('status').filter({ hasText: `cau-hoi-${p}.xlsx` });
  await expect(uploading).toBeVisible();
  await expect(uploading).toContainText('có thể rời trang');
});
