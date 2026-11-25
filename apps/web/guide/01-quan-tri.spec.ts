import { expect, test } from '@playwright/test';
import { openPage, saveState, shot, signIn } from './support';

// Quản trị viên: đăng nhập, Người dùng, Đơn vị, Lời mời (tài liệu quan-tri-vien.md).

test('Quản trị viên: đăng nhập, Người dùng, Đơn vị, Lời mời', async ({ browser }) => {
  const page = await openPage(browser, 'desktop');

  // Màn đăng nhập (dùng chung cho Quản trị viên và Người ra đề)
  await page.goto('/login');
  await shot(page, 'chung', 'dang-nhap-may-tinh', {
    region: { x: 340, y: 90, width: 600, height: 500 },
    marks: [
      { at: page.getByLabel('Tên đăng nhập hoặc email'), text: 'Nhập tên đăng nhập hoặc email' },
      { at: page.getByLabel('Mật khẩu', { exact: true }), text: 'Nhập mật khẩu' },
      { at: page.getByRole('button', { name: 'Đăng nhập' }), text: 'Bấm Đăng nhập' },
    ],
  });
  await signIn(page, 'quantri');

  // Người dùng
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Người dùng', level: 1 })).toBeVisible();
  await shot(page, 'quan-tri', '01-nguoi-dung', {
    marks: [
      {
        at: page.getByRole('navigation', { name: 'Điều hướng chính' }),
        text: 'Thanh điều hướng: các mục quản trị',
        pad: 2,
      },
      {
        at: page.getByPlaceholder('Tên, mã, email, lớp…'),
        text: 'Tìm người dùng theo tên, mã, email hoặc lớp',
      },
      {
        at: page.getByRole('button', { name: 'Tạo Quản trị viên' }),
        text: 'Tạo thêm Quản trị viên',
      },
      {
        at: page.getByRole('link', { name: 'Nguyễn Văn An' }),
        text: 'Bấm tên để mở trang chi tiết của người dùng',
      },
    ],
  });

  // Đơn vị
  await page.getByRole('link', { name: 'Đơn vị' }).click();
  await page.getByRole('button', { name: 'Thêm Đơn vị' }).click();
  const unit = page.getByRole('dialog');
  await unit.getByLabel('Mã Đơn vị').fill('CNTT');
  await unit.getByLabel('Tên Đơn vị').fill('Khoa Công nghệ thông tin');
  await shot(page, 'quan-tri', '02-them-don-vi', {
    marks: [
      { at: unit.getByLabel('Mã Đơn vị'), text: 'Mã ngắn của Đơn vị (ví dụ CNTT)' },
      { at: unit.getByLabel('Tên Đơn vị'), text: 'Tên đầy đủ của Đơn vị' },
      { at: unit.getByRole('button', { name: 'Lưu thay đổi' }), text: 'Bấm Lưu thay đổi' },
    ],
  });
  await unit.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('Khoa Công nghệ thông tin')).toBeVisible();
  await shot(page, 'quan-tri', '03-danh-sach-don-vi');

  // Lời mời
  await page.getByRole('link', { name: 'Lời mời' }).click();
  await page.getByRole('button', { name: 'Mời Người ra đề' }).click();
  const invite = page.getByRole('dialog');
  await invite.getByLabel('Họ tên').fill('Nguyễn Hoài Nam');
  await invite.getByLabel('Email người được mời').fill('hoai.nam@example.edu.vn');
  await invite.getByLabel('Đơn vị').selectOption({ index: 1 });
  await shot(page, 'quan-tri', '04-moi-nguoi-ra-de', {
    marks: [
      { at: invite.getByLabel('Họ tên'), text: 'Họ tên người được mời' },
      { at: invite.getByLabel('Email người được mời'), text: 'Email nhận thư mời' },
      { at: invite.getByLabel('Đơn vị'), text: 'Chọn Đơn vị của người được mời' },
      { at: invite.getByRole('button', { name: 'Gửi thư mời' }), text: 'Bấm Gửi thư mời' },
    ],
  });
  await invite.getByRole('button', { name: 'Gửi thư mời' }).click();
  await expect(page.getByText('Đã gửi thư mời tới hoai.nam@example.edu.vn')).toBeVisible();
  await shot(page, 'quan-tri', '05-loi-moi-da-gui', {
    toast: true,
    marks: [
      {
        at: page.getByRole('listitem').filter({ hasText: 'hoai.nam@example.edu.vn' }),
        text: 'Lời mời đang chờ: có thể Gửi lại hoặc Thu hồi',
      },
    ],
  });
  saveState({ inviteEmail: 'hoai.nam@example.edu.vn' });
});
