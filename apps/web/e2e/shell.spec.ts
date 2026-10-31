import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const main = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });

// Q106: từ 1024 px thanh bên, dưới đó thanh tab dưới đáy (tối đa 5 mục, mục thứ 5 là "Thêm").
test.describe('khung ứng dụng thích ứng', () => {
  test('từ 1024 px: thanh bên có đủ mục của Quản trị viên, không có tab ngang trong nội dung', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await signIn(page, `e2e-khung-${testInfo.project.name}`);
    const nav = main(page);
    await expect(nav).toBeVisible();
    for (const name of [
      'Người dùng',
      'Yêu cầu cấp tài khoản',
      'Lời mời',
      'Đơn vị',
      'Lịch sử đăng nhập',
      'Nhật ký thao tác',
    ]) {
      await expect(nav.getByRole('link', { name })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: 'Người dùng' })).toHaveClass(/active/);
    // thanh bên đứng cạnh nội dung, không phải hàng tab ngang phía trên
    const box = await nav.boundingBox();
    expect(box?.x).toBeLessThan(40);
    expect(box?.height).toBeGreaterThan(200);
  });

  test('từ 1024 px: tên hệ thống trên thanh bên nằm trọn một dòng', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await signIn(page, `e2e-khung-${testInfo.project.name}`);
    const title = page.locator('#app-sidebar').getByText('Hệ thống thi trực tuyến');
    await expect(title).toBeVisible();
    const lineHeight = await title.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).lineHeight),
    );
    const box = await title.boundingBox();
    expect(box?.height).toBeLessThanOrEqual(lineHeight + 1);
  });

  test('dưới 1024 px: thanh tab dưới đáy 4 mục + "Thêm" mở các mục còn lại', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await signIn(page, `e2e-khung-${testInfo.project.name}`);
    const nav = main(page);
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(880); // sát đáy màn hình
    await expect(nav.getByRole('link')).toHaveCount(4);
    await expect(nav.getByRole('link', { name: 'Yêu cầu' })).toBeVisible();

    await nav.getByRole('button', { name: 'Thêm' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link', { name: 'Lịch sử đăng nhập' })).toBeVisible();
    await dialog.getByRole('link', { name: 'Nhật ký thao tác' }).click();
    await expect(page).toHaveURL(/\/admin\/audit-logs/);
    await expect(page.getByRole('heading', { name: 'Nhật ký thao tác', level: 1 })).toBeVisible();
  });

  test('Người ra đề chỉ thấy mục của mình', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, `e2e-yc-gv-${testInfo.project.name}`);
    const nav = main(page);
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: 'Ngân hàng câu hỏi' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Yêu cầu cấp tài khoản' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Người dùng' })).toHaveCount(0);
  });
});

// Thanh bên ẩn/hiện được bằng nút ở đầu trang để nới chỗ soạn; lựa chọn được nhớ trên trình duyệt.
test('thanh bên ẩn/hiện bằng nút và được nhớ sau khi tải lại', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'thanh bên chỉ có từ 1024 px');
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, `e2e-yc-gv-${testInfo.project.name}`);
  const nav = main(page);
  await expect(nav).toBeVisible();
  const before = await page.getByRole('main').boundingBox();

  await page.getByRole('button', { name: 'Ẩn thanh điều hướng' }).click();
  await expect(nav).toBeHidden();
  const after = await page.getByRole('main').boundingBox();
  // nội dung rộng ra chiếm chỗ thanh bên (256 px)
  expect((after?.width ?? 0) - (before?.width ?? 0)).toBeGreaterThan(100);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Hiện thanh điều hướng' })).toBeVisible();
  await expect(nav).toBeHidden();

  await page.getByRole('button', { name: 'Hiện thanh điều hướng' }).click();
  await expect(nav).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ẩn thanh điều hướng' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

// Q108: thông báo nổi cho thao tác thành công, tự mất, không chiếm focus.
test('thao tác thành công hiện thông báo nổi rồi tự mất', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, `e2e-khung-${project}`);
  await page.getByRole('link', { name: 'Đơn vị' }).click();
  await page.getByRole('button', { name: 'Thêm Đơn vị' }).click();
  await page.getByLabel('Mã Đơn vị').fill(`TOAST-${project}`);
  await page.getByLabel('Tên Đơn vị').fill(`Khoa thử toast ${project}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu thay đổi' }).click();

  const toast = page.getByRole('status').filter({ hasText: 'Đã thêm Đơn vị' });
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 8000 });
});

// Q106/Q107: các điểm gãy sát ranh giới, quy tắc 5 mục, mục đang chọn trong "Thêm", trạng thái trên URL, mật độ theo thiết bị trỏ.
test.describe('khung ứng dụng: biên và quy tắc', () => {
  test('1023 px vẫn là thanh tab dưới đáy, 1440 px là thanh bên và nội dung không rộng quá 1152 px', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await signIn(page, `e2e-khung-${testInfo.project.name}`);
    await expect(main(page).getByRole('button', { name: 'Thêm' })).toBeVisible();
    await expect(page.locator('aside')).toBeHidden();

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('aside')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Thêm' })).toBeHidden();
    const content = await page.locator('main').boundingBox();
    expect(content?.width).toBeLessThanOrEqual(1152 + 1);
  });

  test('quá 5 mục thì 4 mục + "Thêm"; "Thêm" sáng lên khi đang ở một mục trong đó', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `e2e-khung-${testInfo.project.name}`);
    const nav = main(page);
    await expect(nav.getByRole('link')).toHaveCount(4);
    await expect(nav.getByRole('button', { name: 'Thêm' })).not.toHaveClass(/text-primary/);

    await page.goto('/admin/audit-logs');
    await expect(page.getByRole('heading', { name: 'Nhật ký thao tác', level: 1 })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Thêm' })).toHaveClass(/text-primary/);
  });

  test('tìm kiếm nằm trên URL: mở một người rồi Quay lại vẫn giữ từ khóa', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, `e2e-khung-${testInfo.project.name}`);
    await page.getByRole('searchbox', { name: 'Tìm Người dùng' }).fill('quản trị khung');
    await expect(page).toHaveURL(
      /q=qu%E1%BA%A3n\+tr%E1%BB%8B\+khung|q=qu%E1%BA%A3n%20tr%E1%BB%8B%20khung/,
    );
    await page
      .getByRole('link', { name: /Quản trị khung/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}/);
    await page.goBack();
    await expect(page.getByRole('searchbox', { name: 'Tìm Người dùng' })).toHaveValue(
      'quản trị khung',
    );
  });

  test('mật độ theo thiết bị trỏ: chuột 36 px, cảm ứng 48 px (Q109)', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, `e2e-khung-${testInfo.project.name}`);
    await page.getByRole('link', { name: 'Đơn vị' }).click();
    const box = await page.getByRole('button', { name: 'Thêm Đơn vị' }).boundingBox();
    if (testInfo.project.name === 'desktop') expect(box?.height).toBeLessThanOrEqual(37);
    else expect(box?.height).toBeGreaterThanOrEqual(48);
  });
});

// §11: thông báo lỗi ở lại cho tới khi đóng; thông báo không che thanh hành động.
test('thông báo nổi nằm phía trên, không đè lên thanh tab hay thanh hành động dính đáy', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, `e2e-khung-${project}`);
  await page.getByRole('link', { name: 'Đơn vị' }).click();
  await page.getByRole('button', { name: 'Thêm Đơn vị' }).click();
  await page.getByLabel('Mã Đơn vị').fill(`VT-${project}`);
  await page.getByLabel('Tên Đơn vị').fill(`Khoa vị trí ${project}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu thay đổi' }).click();
  const toast = page.getByRole('status').filter({ hasText: 'Đã thêm Đơn vị' });
  await expect(toast).toBeVisible();
  const box = await toast.boundingBox();
  expect(box?.y).toBeLessThan(200); // ở phía trên màn hình, cách xa thanh tab dưới đáy
});
