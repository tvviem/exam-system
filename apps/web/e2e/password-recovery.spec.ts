import { expect, type Page, test } from '@playwright/test';

// Kịch bản "quên mật khẩu" trên giao diện (PR 7a, viết lại ở 7d-3): Người ra đề hoặc Người dự thi đã đổi mật khẩu từ lâu thì quên và
// không dùng được email. Quản trị viên KHÔNG còn cấp mật khẩu tạm (Quản trị viên không biết mật khẩu của ai): họ tạo Liên kết hỗ
// trợ (hiện một lần), người đó mở liên kết và tự đặt mật khẩu mới. Phía API: apps/api/test/account-support.int.test.ts.

const PASSWORD = 'mat-khau-on-dinh';
const PASSWORD_CU = 'mat-khau-da-doi-lau';
const PASSWORD_MOI = 'hoa-sen-no-sang-moi';

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

for (const [code, label, search] of [
  ['gv', 'Giảng viên', 'giang vien'],
  ['nt', 'Sinh viên', 'sinh vien'],
] as const) {
  test(`${label} quên mật khẩu: Quản trị viên đưa Liên kết hỗ trợ, người đó tự đặt mật khẩu mới (không ai khác biết mật khẩu)`, async ({
    page,
    browser,
  }, testInfo) => {
    const project = testInfo.project.name;
    const username = `e2e-quen-mk-${code}-${project}`;

    // 1. Quản trị viên tìm người đó, mở thẻ "Kích hoạt và email" và tạo Liên kết hỗ trợ (bắt buộc lý do).
    await signIn(page, `e2e-quen-mk-qt-${project}`, PASSWORD);
    await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
    await page
      .getByRole('searchbox', { name: 'Tìm Người dùng' })
      .fill(`${search} quen mk ${project}`);
    await expect(page).toHaveURL(/q=/);
    await page
      .getByRole('link', { name: new RegExp(`${label} Quên MK ${project}`) })
      .first()
      .click();
    // Không còn nút cấp mật khẩu tạm.
    await expect(page.getByRole('button', { name: 'Cấp lại mật khẩu tạm' })).toHaveCount(0);
    const card = page.getByRole('region', { name: 'Kích hoạt và email' });
    await card.getByRole('button', { name: 'Tạo liên kết hỗ trợ…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Lý do').fill('Quên mật khẩu, không dùng được email');
    await dialog.getByRole('button', { name: 'Tạo liên kết' }).click();
    const link = await dialog.getByLabel('Liên kết hỗ trợ').inputValue();
    expect(link).toMatch(/\/reset-password#[\w-]{30,}$/);
    await expect(dialog.getByRole('note')).toContainText('chỉ hiện một lần');
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();

    // 2. Người đó mở liên kết (trình duyệt khác, chưa đăng nhập) và tự đặt mật khẩu mới.
    const user = await browser.newPage();
    await user.goto(link);
    await user.getByLabel('Mật khẩu mới').fill(PASSWORD_MOI);
    await user.getByLabel('Nhập lại mật khẩu').fill(PASSWORD_MOI);
    await user.getByRole('button', { name: 'Đặt mật khẩu mới' }).click();
    await expect(user.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();

    // 3. Mật khẩu cũ hết hiệu lực; mật khẩu mới vào được ngay.
    await signIn(user, username, PASSWORD_CU);
    await expect(user.getByRole('alert')).toContainText('Tên đăng nhập hoặc mật khẩu không đúng.');
    await signIn(user, username, PASSWORD_MOI);
    await expect(user.getByRole('button', { name: 'Tài khoản' })).toBeVisible();
    await user.close();
  });
}
