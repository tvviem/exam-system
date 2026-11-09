import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

// Màn hình "Sao lưu" chỉ đọc cho Quản trị viên (Q365). Dòng `backup_runs` do script sao lưu ghi bằng psql, nên ở đây
// chèn thẳng vào database E2E (cùng cách prepare-api.cjs dùng pg của gói api).
const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const { Client } = apiRequire('pg');
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://exam:exam@127.0.0.1:5434/exam_e2e';
const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
}

async function addRun(
  project: string,
  kind: string,
  status: 'ok' | 'failed',
  agoMinutes: number,
  detail: string,
  extra: { seconds?: number; bytes?: number } = {},
) {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query(
      `INSERT INTO backup_runs (id, run_key, kind, status, finished_at, seconds, bytes, detail)
       VALUES (gen_random_uuid(), $1, $2, $3, now() - make_interval(mins => $4), $5, $6, $7)`,
      [
        `e2e-${project}-${kind}-${Date.now()}-${Math.random()}`,
        kind,
        status,
        agoMinutes,
        extra.seconds ?? null,
        extra.bytes ?? null,
        detail,
      ],
    );
  } finally {
    await db.end();
  }
}

test('Quản trị viên thấy tóm tắt, vấn đề chưa xử lý và danh sách lần chạy; chỉ đọc', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  await addRun(project, 'dump-nightly', 'ok', 120, `bản đêm ${project}`, {
    seconds: 3,
    bytes: 152_000,
  });
  await addRun(project, 'restore-test', 'ok', 60 * 24 * 3, `thử khôi phục ${project}`, {
    seconds: 27,
  });
  await addRun(project, 'push', 'failed', 30, `đẩy lên R2 lỗi ${project}`);

  await signIn(page, `e2e-sao-luu-${project}`);
  await page.goto('/admin/backup');
  await expect(page.getByRole('heading', { name: 'Sao lưu dữ liệu', level: 1 })).toBeVisible();

  // Dải cảnh báo: việc nào có dòng mới nhất là lỗi.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Có việc sao lưu đang lỗi');
  await expect(alert).toContainText('Đẩy sang ổ chép và R2');

  // Ba ô tóm tắt.
  await expect(page.getByText('Bản đêm gần nhất')).toBeVisible();
  await expect(page.getByText('Bản nền gần nhất')).toBeVisible();
  await expect(page.getByText('Thử khôi phục gần nhất')).toBeVisible();
  await expect(page.getByText('Chưa có').first()).toBeVisible(); // chưa có bản nền

  // Danh sách: dòng của chính test này.
  await expect(page.getByText(`bản đêm ${project}`)).toBeVisible();
  await expect(page.getByText(`đẩy lên R2 lỗi ${project}`).first()).toBeVisible();

  // Chỉ đọc: không có nút nào trong vùng nội dung.
  const content = page.locator('section', {
    has: page.getByRole('heading', { name: 'Sao lưu dữ liệu', level: 1 }),
  });
  // Chỉ còn hai nút chuyển trang (tắt khi chỉ có một trang); không có nút nào làm thay đổi hệ thống.
  const buttons = await content
    .getByRole('button')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(buttons).toEqual(['Trang trước', 'Trang sau']);

  // Không cuộn ngang (điện thoại hay màn rộng).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
