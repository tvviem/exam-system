import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

// PR 7d-1, lát 6 (E-01 đến E-03): Quản trị viên xử lý khi thư kích hoạt không tới: Gửi lại, Sửa email, Liên kết hỗ trợ.
test('Quản trị viên hỗ trợ kích hoạt: gửi lại, sửa email, tạo liên kết hỗ trợ; người dùng dùng liên kết đặt mật khẩu và đăng nhập', async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const name = `Hỗ Trợ ${project}`;
  const email = `ho.tro.${project}@example.edu.vn`;

  await signIn(page, `e2e-khoa-qt-${project}`);
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();

  // Tạo một tài khoản Chờ kích hoạt (Quản trị viên mới, chưa kích hoạt).
  await page.getByRole('button', { name: 'Tạo Quản trị viên' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Họ tên').fill(name);
  await create.getByLabel('Email nhận thư kích hoạt').fill(email);
  await create.getByLabel('Tên đăng nhập (không bắt buộc)').fill(`ho-tro-${project}`);
  await create.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(create.getByRole('status')).toContainText('Đã gửi thư kích hoạt');
  await create.getByRole('button', { name: 'Đóng', exact: true }).last().click();

  // Bộ lọc "Chờ kích hoạt" thấy tài khoản vừa tạo, kèm dấu hiệu.
  await page.goto('/admin/users?activation=pending');
  const row = page.getByRole('link', { name }).filter({ visible: true });
  await expect(row).toBeVisible();
  await expect(page.getByText('Chờ kích hoạt').filter({ visible: true }).first()).toBeVisible();
  await row.click();

  // Thẻ "Kích hoạt và email".
  const card = page.getByRole('region', { name: 'Kích hoạt và email' });
  await expect(card.getByText('Chờ kích hoạt')).toBeVisible();
  await expect(card.getByText(email)).toBeVisible();

  // Gửi lại: lần đầu được (thư kích hoạt từ lúc tạo đã tính một lần: thư tạo tài khoản không tính vào giới hạn Gửi lại).
  await card.getByRole('button', { name: 'Gửi lại thư kích hoạt' }).click();
  await expect(page.getByText('Đã xếp thư để gửi')).toBeVisible();
  // Lần hai trong 24 giờ bị từ chối.
  await card.getByRole('button', { name: 'Gửi lại thư kích hoạt' }).click();
  await expect(card.getByRole('alert')).toBeVisible();

  // Sửa email: bắt buộc lý do.
  await card.getByRole('button', { name: 'Sửa email…' }).click();
  const change = page.getByRole('dialog');
  await change.getByLabel('Email mới').fill(`moi.${project}@example.edu.vn`);
  await change.getByRole('button', { name: 'Sửa email', exact: true }).click();
  await expect(change.getByLabel('Lý do')).toBeFocused(); // trình duyệt chặn, chưa có yêu cầu nào
  await change.getByLabel('Lý do').fill('Sinh viên báo gõ nhầm email');
  await change.getByRole('button', { name: 'Sửa email', exact: true }).click();
  await expect(card.getByText(`moi.${project}@example.edu.vn`)).toBeVisible();

  // Liên kết hỗ trợ: hiện một lần.
  await card.getByRole('button', { name: 'Tạo liên kết hỗ trợ…' }).click();
  const linkDialog = page.getByRole('dialog');
  await linkDialog.getByLabel('Lý do').fill('Thư không tới, sinh viên có mặt');
  await linkDialog.getByRole('button', { name: 'Tạo liên kết' }).click();
  const link = await linkDialog.getByLabel('Liên kết hỗ trợ').inputValue();
  expect(link).toMatch(/\/activate#[\w-]{30,}$/);
  await expect(linkDialog.getByRole('note')).toContainText('chỉ hiện một lần');
  await linkDialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  // Mở lại hộp thoại thì không còn liên kết cũ.
  await card.getByRole('button', { name: 'Tạo liên kết hỗ trợ…' }).click();
  await expect(page.getByRole('dialog').getByLabel('Liên kết hỗ trợ')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).last().click();

  // Không cuộn ngang.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  // Người dùng mở liên kết (cửa sổ khác, chưa đăng nhập), tự đặt mật khẩu và đăng nhập.
  const user = await browser.newPage();
  await user.goto(link);
  await expect(user.getByRole('heading', { name: 'Kích hoạt tài khoản' })).toBeVisible();
  await user.getByLabel('Mật khẩu mới').fill('hoa-sen-no-sang-moi-2026');
  await user.getByLabel('Nhập lại mật khẩu').fill('hoa-sen-no-sang-moi-2026');
  await user.getByRole('button', { name: 'Kích hoạt', exact: true }).click();
  await expect(user.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
  await user.goto('/login');
  await user.getByLabel('Tên đăng nhập hoặc email').fill(`ho-tro-${project}`);
  await user.getByLabel('Mật khẩu', { exact: true }).fill('hoa-sen-no-sang-moi-2026');
  await user.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(user).not.toHaveURL(/\/login/);
  await user.close();
});

test('E-03: đăng nhập thất bại hiện câu chung có chỉ dẫn kích hoạt, giống nhau cho tên không tồn tại', async ({
  page,
}) => {
  const message = async (identifier: string) => {
    await page.goto('/login');
    await page.getByLabel('Tên đăng nhập hoặc email').fill(identifier);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('sai-mat-khau-roi-nhe');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    return (await page.getByRole('alert').textContent()) ?? '';
  };
  const first = await message('khong-co-nguoi-nay');
  const second = await message('nguoi-khac-nua');
  expect(first).toBe(second);
  expect(first).toContain('Quên mật khẩu');
  expect(first).toContain('kiểm tra hộp thư');
});
