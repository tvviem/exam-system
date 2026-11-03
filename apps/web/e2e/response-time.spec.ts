import { expect, test } from '@playwright/test';

// Phản hồi tức thời là yêu cầu hàng đầu: người dùng chờ quá 2–3 giây là đã chậm. Các test này giữ ngưỡng thời gian cho
// những đường dễ chậm một cách âm thầm; chạy trên máy CI chậm hơn máy thường nên ngưỡng rộng gấp vài lần thực tế (<0,5 s),
// vẫn đủ bắt lỗi kiểu "thử lại 7 giây".

const GONE = '00000000-0000-7000-8000-000000000000';

test('Trang chi tiết không tồn tại báo lỗi ngay, không thử lại nhiều giây', async ({
  page,
}, testInfo) => {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(`e2e-rt-gv-${testInfo.project.name}`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-on-dinh');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  for (const path of ['sessions', 'exams', 'questions']) {
    const started = Date.now();
    await page.goto(`/examiner/${path}/${GONE}`);
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 2500 });
    expect(Date.now() - started, `/examiner/${path}/<không có>`).toBeLessThan(2500);
  }
});
