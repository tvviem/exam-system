import { expect, test } from '@playwright/test';
import { knownInviteToken, openPage, readState, saveState, shot, signIn } from './support';

// Người ra đề: nhận Lời mời, vào hệ thống, gửi Yêu cầu cấp tài khoản cho Người dự thi (tài liệu nguoi-ra-de.md).

test('Người được mời nhận Lời mời và tạo tài khoản', async ({ browser }) => {
  const email = readState().inviteEmail ?? 'hoai.nam@example.edu.vn';
  const token = await knownInviteToken(email);
  const page = await openPage(browser, 'desktop');
  await page.goto(`/invite#${token}`);
  await expect(page.getByRole('heading', { name: 'Lời mời làm Người ra đề' })).toBeVisible();
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-moi-rat-dai');
  await page.getByLabel('Nhập lại mật khẩu').fill('mat-khau-moi-rat-dai');
  await page.getByLabel('Học vị').selectOption({ label: 'Thạc sĩ' });
  await shot(page, 'nguoi-ra-de', '01-nhan-loi-moi', {
    full: true,
    marks: [
      { at: page.getByText(email), text: 'Email nhận Lời mời (đúng người được mời)' },
      {
        at: page.getByLabel('Mật khẩu', { exact: true }),
        text: 'Đặt mật khẩu (tối thiểu 12 ký tự)',
      },
      { at: page.getByLabel('Nhập lại mật khẩu'), text: 'Nhập lại mật khẩu' },
      {
        at: page.getByRole('button', { name: 'Tạo tài khoản và vào hệ thống' }),
        text: 'Bấm Tạo tài khoản và vào hệ thống',
      },
    ],
  });
  await page.getByRole('button', { name: 'Tạo tài khoản và vào hệ thống' }).click();
  await expect(page).toHaveURL(/\/examiner\/sessions/);
  await expect(page.getByRole('heading', { name: 'Phiên thi', level: 1 })).toBeVisible();
  await shot(page, 'nguoi-ra-de', '02-trang-dau', {
    marks: [
      {
        at: page.getByRole('navigation', { name: 'Điều hướng chính' }),
        text: 'Thanh điều hướng: Ngân hàng câu hỏi, Bộ đề, Phiên thi, Yêu cầu cấp tài khoản',
        pad: 2,
      },
      { at: page.getByRole('link', { name: 'Tạo Phiên thi' }).first(), text: 'Tạo Phiên thi mới' },
    ],
  });
});

test('Người ra đề gửi Yêu cầu cấp tài khoản cho Người dự thi', async ({ browser }) => {
  const page = await openPage(browser, 'desktop');
  await signIn(page, 'tran.mai');
  await page
    .getByRole('link', { name: /^Yêu cầu/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Yêu cầu cấp tài khoản', level: 1 }),
  ).toBeVisible();
  const csv = [
    'Họ tên,Mã định danh,Email,Lớp,Ngày sinh,Giới tính',
    'Phan Thị Ánh,SV26101,anh.phan@example.edu.vn,CNTT-K26,12/04/2006,Nữ',
    'Trương Quốc Bảo,SV26102,bao.truong@example.edu.vn,CNTT-K26,03/09/2006,Nam',
    'Huỳnh Minh Châu,SV26103,chau.huynh@example.edu.vn,CNTT-K26,21/01/2006,Nữ',
    'Tạ Văn Dũng,SV26104,dung.ta@example.edu.vn,CNTT-K26,,Nam',
    ',SV26105,loi@example.edu.vn,CNTT-K26,,',
  ].join('\n');
  await page.getByLabel('File danh sách').setInputFiles({
    name: 'danh-sach-lop-CNTT-K26.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByLabel('Ghi chú').fill('Lớp CNTT-K26, học kỳ 1');
  await shot(page, 'nguoi-ra-de', '03-gui-yeu-cau', {
    full: true,
    marks: [
      {
        at: page.getByRole('link', { name: 'Tải file mẫu' }),
        text: 'Tải file mẫu về, điền danh sách (mỗi dòng bắt buộc có email)',
      },
      { at: page.getByLabel('File danh sách'), text: 'Chọn file Excel hoặc CSV đã điền' },
      { at: page.getByRole('button', { name: 'Gửi yêu cầu' }), text: 'Bấm Gửi yêu cầu' },
    ],
  });
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(page.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 20_000 });
  await shot(page, 'nguoi-ra-de', '04-yeu-cau-cho-duyet', { full: true });
  await page.getByRole('button', { name: /Không duyệt được/ }).click();
  await shot(page, 'nguoi-ra-de', '05-dong-loi', { full: true });
  saveState({ requestUrl: page.url() });
});
