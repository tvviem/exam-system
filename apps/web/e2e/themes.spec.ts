import { expect, test } from '@playwright/test';

// docs/ui-design.md mục 4, 8: mỗi màn hình được kiểm ở cả hai chế độ, ở 360 px và màn rộng.
// Không so ảnh từng điểm ảnh (font hiển thị khác nhau giữa các máy); ảnh đính kèm vào báo cáo để xem.

const PASSWORD = 'mat-khau-on-dinh';
const THEME_COLOR = { light: '#ffffff', dark: '#0f172a' };
const PAGES = [
  ['dang-nhap', '/login'],
  ['nguoi-dung', '/admin/users'],
  ['don-vi', '/admin/units'],
  ['loi-moi', '/admin/invitations'],
  ['lich-su-dang-nhap', '/admin/login-events'],
  ['nhat-ky-thao-tac', '/admin/audit-logs'],
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`chế độ ${scheme === 'light' ? 'sáng' : 'tối'}`, () => {
    test.use({ colorScheme: scheme });

    test('theo chế độ của hệ điều hành, không cuộn ngang', async ({ page }, testInfo) => {
      const project = testInfo.project.name;
      if (project === 'mobile') await page.setViewportSize({ width: 360, height: 780 });

      for (const [name, path] of PAGES) {
        if (path !== '/login' && page.url().endsWith('/login')) {
          await page.getByLabel('Tên đăng nhập hoặc email').fill(`e2e-giao-dien-${project}`);
          await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
          await page.getByRole('button', { name: 'Đăng nhập' }).click();
          await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
        }
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
        await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
          'content',
          THEME_COLOR[scheme],
        );
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} cuộn ngang`).toBe(0);

        await testInfo.attach(`${name}-${scheme}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    });
  });
}
