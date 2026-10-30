import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function openAccount(page: Page) {
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Tài khoản của tôi' }).click();
  await expect(page.getByRole('heading', { name: 'Tài khoản của tôi', level: 1 })).toBeVisible();
}

// Q132–Q136: trang "Tài khoản của tôi": xem, tự sửa theo vai trò, đổi mật khẩu.
test('Người ra đề xem và sửa thông tin, đổi mật khẩu rồi đăng nhập lại bằng mật khẩu mới', async ({
  page,
}, testInfo) => {
  const username = `e2e-tk-gv-${testInfo.project.name}`;
  await signIn(page, username);
  await openAccount(page);

  // phần do Quản trị viên quản lý chỉ để xem
  await expect(page.getByText('Do Quản trị viên quản lý')).toBeVisible();
  await expect(page.getByText(username)).toBeVisible();
  await expect(page.getByLabel('Tên đăng nhập')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();

  await page.getByLabel('Họ và tên').fill('Giảng viên Đã Đổi Tên');
  await page.getByLabel('Học vị').selectOption('doctor');
  await page.getByLabel('Học hàm').selectOption('professor');
  await page.getByLabel('Ngày sinh').fill('1985-04-02');
  await page.getByLabel('Giới tính').selectOption('male');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('Đã lưu thông tin')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Họ và tên')).toHaveValue('Giảng viên Đã Đổi Tên');
  await expect(page.getByLabel('Học vị')).toHaveValue('doctor');
  await expect(page.getByLabel('Ngày sinh')).toHaveValue('1985-04-02');

  // mật khẩu: lệch thì báo, đúng thì đổi và vẫn đang đăng nhập
  await page.getByLabel('Mật khẩu hiện tại').fill(PASSWORD);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('mot-mat-khau-moi-kha-dai');
  await page.getByLabel('Nhập lại mật khẩu mới').fill('khac-mat-khau-moi-kha-dai');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByText('Hai lần nhập mật khẩu mới không khớp.')).toBeVisible();
  await page.getByLabel('Nhập lại mật khẩu mới').fill('mot-mat-khau-moi-kha-dai');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByText('Đã đổi mật khẩu.')).toBeVisible();
  await expect(page.getByLabel('Mật khẩu hiện tại')).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Tài khoản của tôi', level: 1 })).toBeVisible();

  // đăng xuất rồi vào lại bằng mật khẩu mới
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.waitForURL(/\/login/);
  await signIn(page, username, 'mot-mat-khau-moi-kha-dai');
  await expect(page.getByRole('button', { name: 'Tài khoản', exact: true })).toBeVisible();
});

test('Người dự thi chỉ tự sửa ngày sinh và giới tính', async ({ page }, testInfo) => {
  await signIn(page, `e2e-tk-sv-${testInfo.project.name}`);
  await openAccount(page);
  await expect(page.getByLabel('Họ và tên')).toHaveCount(0);
  await expect(page.getByLabel('Học vị')).toHaveCount(0);
  await page.getByLabel('Ngày sinh').fill('2005-09-01');
  await page.getByLabel('Giới tính').selectOption('female');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('Đã lưu thông tin')).toBeVisible();
  await expect(page.getByText('Người dự thi')).toBeVisible();
});
