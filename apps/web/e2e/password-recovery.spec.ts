import { expect, type Page, test } from '@playwright/test';

// Kịch bản "quên mật khẩu" trên giao diện (PR 7a, docs/plan/slice-7.md Q371): Người ra đề hoặc Người dự thi đã đổi mật khẩu từ lâu
// thì quên; Quản trị viên cấp lại mật khẩu tạm (hiển thị một lần), người đó đăng nhập bằng mật khẩu tạm, bị buộc đổi, đặt mật khẩu mới.
// Phía API đã có bài trọn kịch bản ở apps/api/test/password-recovery.int.test.ts; bài này kiểm hộp thoại và luồng trên trình duyệt.

const PASSWORD = 'mat-khau-on-dinh';
const PASSWORD_CU = 'mat-khau-da-doi-lau';
const PASSWORD_MOI = 'hoa-sen-no-sang-moi';

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Tài khoản' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login/);
}

for (const [code, label, search] of [
  ['gv', 'Giảng viên', 'giang vien'],
  ['nt', 'Sinh viên', 'sinh vien'],
] as const) {
  test(`${label} quên mật khẩu: Quản trị viên cấp lại, người đó dùng mật khẩu tạm rồi tự đặt mật khẩu mới`, async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name;
    const username = `e2e-quen-mk-${code}-${project}`;

    // 1. Quản trị viên tìm người đó và cấp lại mật khẩu tạm.
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
    await page.getByRole('button', { name: 'Cấp lại mật khẩu tạm' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('Mật khẩu cũ mất hiệu lực');
    await confirm.getByRole('button', { name: 'Cấp lại mật khẩu tạm' }).click();

    // 2. Mật khẩu tạm hiện đúng một lần; không đóng được bằng Esc, phải bấm xác nhận đã lưu.
    const shown = page.getByTestId('temporary-password');
    await expect(shown).toBeVisible();
    const temporaryPassword = ((await shown.textContent()) ?? '').trim();
    expect(temporaryPassword).toMatch(/^[a-zA-Z2-9]{10}$/);
    await page.keyboard.press('Escape');
    await expect(shown).toBeVisible();
    await page.getByRole('button', { name: 'Tôi đã lưu mật khẩu' }).click();
    await expect(shown).toHaveCount(0);
    // Tải lại trang: mật khẩu không còn ở đâu trên giao diện.
    await page.reload();
    await expect(page.getByText(temporaryPassword)).toHaveCount(0);
    await signOut(page);

    // 3. Người đó thử mật khẩu cũ: không vào được.
    await signIn(page, username, PASSWORD_CU);
    await expect(page.getByRole('alert')).toContainText('Tên đăng nhập hoặc mật khẩu không đúng.');

    // 4. Dùng mật khẩu tạm: bị buộc đổi mật khẩu; mật khẩu yếu bị từ chối; đặt mật khẩu mới thì vào được.
    await signIn(page, username, temporaryPassword);
    await expect(page.getByRole('heading', { name: 'Đổi mật khẩu' })).toBeVisible();
    await page.getByLabel('Mật khẩu hiện tại').fill(temporaryPassword);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill('ngan');
    await page.getByLabel('Nhập lại mật khẩu mới').fill('ngan');
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await expect(page.getByRole('alert')).toContainText('ít nhất 10 ký tự');
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(PASSWORD_MOI);
    await page.getByLabel('Nhập lại mật khẩu mới').fill(PASSWORD_MOI);
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await expect(page.getByRole('button', { name: 'Tài khoản' })).toBeVisible();
    await signOut(page);

    // 5. Mật khẩu tạm không dùng lại được; mật khẩu mới dùng được.
    await signIn(page, username, temporaryPassword);
    await expect(page.getByRole('alert')).toContainText('Tên đăng nhập hoặc mật khẩu không đúng.');
    await signIn(page, username, PASSWORD_MOI);
    await expect(page.getByRole('button', { name: 'Tài khoản' })).toBeVisible();
  });
}
