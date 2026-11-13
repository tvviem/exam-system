import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

test('Quản trị viên tìm một người, Khóa đăng nhập, người đó đăng nhập thì thấy báo bị khóa', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;

  await signIn(page, `e2e-khoa-qt-${project}`);
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();

  // Tìm không dấu.
  await page.getByRole('searchbox', { name: 'Tìm Người dùng' }).fill(`nguyen van khoa ${project}`);
  // Chờ kết quả của từ khóa (sau 300 ms ngừng gõ) rồi mới bấm, kẻo bấm vào kết quả cũ.
  await expect(page).toHaveURL(/q=nguyen/);
  await page
    .getByRole('link', { name: new RegExp(`Nguyễn Văn Khóa ${project}`) })
    .first()
    .click();

  await page.getByRole('button', { name: 'Khóa đăng nhập' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Lý do').fill('Nghi lộ mật khẩu');
  await dialog.getByRole('button', { name: 'Khóa đăng nhập' }).click();
  await expect(page.getByText('Lý do: Nghi lộ mật khẩu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở khóa' })).toBeVisible();

  await page.getByRole('button', { name: 'Tài khoản' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await signIn(page, `e2e-khoa-ndt-${project}`);
  await expect(page.getByRole('alert')).toHaveText(
    'Tài khoản đã bị Khóa đăng nhập. Hãy liên hệ Quản trị viên.',
  );
});

test('Quản trị viên tạo Quản trị viên bằng email: nhận báo đã gửi thư kích hoạt, không có mật khẩu tạm', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page, `e2e-khoa-qt-${project}`);
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();

  await page.getByRole('button', { name: 'Tạo Quản trị viên' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Họ tên').fill(`Quản Trị Mới ${project}`);
  // Email bắt buộc: bỏ trống thì trình duyệt chặn gửi, không có yêu cầu nào đi.
  await dialog.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(dialog.getByLabel('Email nhận thư kích hoạt')).toBeFocused();

  await dialog.getByLabel('Email nhận thư kích hoạt').fill(`qt.moi.${project}@example.edu.vn`);
  await dialog.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(
    dialog.getByRole('status').filter({ hasText: `qt.moi.${project}@example.edu.vn` }),
  ).toContainText('Đã gửi thư kích hoạt tới');
  await expect(dialog.getByText(/mật khẩu tạm/i)).toHaveCount(0);
  // Hộp thoại có nút đóng ở góc và nút "Đóng" ở cuối nội dung; bấm nút cuối.
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await expect(dialog).toBeHidden();
});
