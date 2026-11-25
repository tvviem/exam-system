import { expect, test } from '@playwright/test';
import { openPage, shot, signIn } from './support';

// Quản trị viên: người dùng, lịch sử, nhật ký, hàng đợi thư, sao lưu (tài liệu quan-tri-vien.md).

test('Quản trị viên: người dùng và các trang theo dõi', async ({ browser }) => {
  const page = await openPage(browser, 'desktop');
  await signIn(page, 'quantri');

  // Lọc những người chưa kích hoạt
  await page.goto('/admin/users');
  await page.getByLabel('Kích hoạt').selectOption({ label: 'Chờ kích hoạt' });
  await expect(page.getByRole('link', { name: 'Phan Thị Ánh' })).toBeVisible();
  await shot(page, 'quan-tri', '10-loc-cho-kich-hoat', {
    marks: [
      {
        at: page.getByLabel('Kích hoạt'),
        text: 'Lọc theo trạng thái kích hoạt: Chờ kích hoạt, Email chưa xác thực, Thư lỗi',
      },
      {
        at: page.getByLabel('Nhãn vai trò'),
        text: 'Lọc theo Nhãn vai trò (Người ra đề, Người dự thi)',
      },
    ],
  });

  // Trang chi tiết một người dùng
  await page.getByRole('link', { name: 'Phan Thị Ánh' }).click();
  await expect(page.getByRole('heading', { name: 'Phan Thị Ánh', level: 1 })).toBeVisible();
  await shot(page, 'quan-tri', '11-chi-tiet-nguoi-dung', {
    full: true,
    marks: [
      {
        at: page.getByRole('heading', { name: 'Thông tin' }),
        text: 'Thông tin cá nhân: sửa rồi bấm Lưu thay đổi',
      },
      {
        at: page.getByRole('checkbox', { name: 'Người ra đề' }),
        text: 'Nhãn vai trò: quyết định người này vào được khu nào',
      },
      {
        at: page.getByRole('button', { name: 'Gửi lại thư kích hoạt' }),
        text: 'Gửi lại thư kích hoạt khi người dùng chưa nhận được thư',
      },
      {
        at: page.getByRole('button', { name: 'Tạo liên kết hỗ trợ…' }),
        text: 'Tạo liên kết kích hoạt để chuyển trực tiếp khi thư không tới',
      },
      {
        at: page.getByRole('button', { name: 'Khóa đăng nhập' }),
        text: 'Khóa đăng nhập: người này không đăng nhập được cho tới khi mở khóa',
      },
    ],
  });
  await page.getByRole('button', { name: 'Khóa đăng nhập' }).click();
  await shot(page, 'quan-tri', '12-khoa-dang-nhap', {
    marks: [
      {
        at: page.getByRole('dialog').getByLabel(/Lý do/),
        text: 'Ghi lý do (lưu vào Nhật ký thao tác)',
      },
    ],
  });
  await page.keyboard.press('Escape');

  // Tạo Quản trị viên
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Tạo Quản trị viên' }).click();
  await shot(page, 'quan-tri', '13-tao-quan-tri-vien');
  await page.keyboard.press('Escape');

  // Lịch sử đăng nhập, Nhật ký thao tác, Hàng đợi thư, Sao lưu
  await page.goto('/admin/login-events');
  await shot(page, 'quan-tri', '14-lich-su-dang-nhap', {
    marks: [
      {
        at: page.getByLabel('Kết quả'),
        text: 'Lọc theo kết quả đăng nhập (thành công, sai mật khẩu, bị khóa...)',
      },
    ],
  });
  await page.goto('/admin/audit-logs');
  await shot(page, 'quan-tri', '15-nhat-ky-thao-tac', {
    marks: [{ at: page.getByLabel('Hành động'), text: 'Lọc theo loại thao tác' }],
  });
  await page.goto('/admin/mail-queue');
  await shot(page, 'quan-tri', '16-hang-doi-thu', { full: true });
  await page.goto('/admin/backup');
  await shot(page, 'quan-tri', '17-sao-luu-du-lieu', { full: true });
  await page.goto('/account');
  await shot(page, 'chung', 'tai-khoan-cua-toi', { full: true });
});
