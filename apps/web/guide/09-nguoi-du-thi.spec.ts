import { expect, type Page, test } from '@playwright/test';
import { openPage, readState, shot, signIn } from './support';

// Người dự thi (điện thoại): kích hoạt, đăng nhập, Vào thi, làm bài, nộp bài (tài liệu nguoi-du-thi.md).

/** Bấm Câu tiếp cho tới khi thấy phần tử mong muốn (đề rút ngẫu nhiên nên thứ tự Loại câu hỏi khác nhau). */
async function nextUntil(page: Page, found: () => Promise<boolean>) {
  for (let i = 0; i < 30; i++) {
    if (await found()) return;
    await page.getByRole('button', { name: 'Câu tiếp' }).click();
    await page.waitForTimeout(150);
  }
  throw new Error('không thấy Loại câu hỏi cần chụp');
}

test('Người ra đề tạo liên kết hỗ trợ; Người dự thi kích hoạt tài khoản', async ({ browser }) => {
  const examiner = await openPage(browser, 'desktop');
  await signIn(examiner, 'tran.mai');
  await examiner.goto(readState().requestUrl);
  await expect(examiner.getByText('Theo dõi kích hoạt')).toBeVisible();
  await examiner
    .getByRole('button', { name: 'Liên kết hỗ trợ của Phan Thị Ánh' })
    .filter({ visible: true })
    .click();
  const dialog = examiner.getByRole('dialog');
  await dialog.getByLabel('Lý do').fill('Thư chưa tới, sinh viên có mặt tại phòng');
  await dialog.getByRole('button', { name: 'Tạo liên kết' }).click();
  const link = await dialog.getByLabel('Liên kết hỗ trợ').inputValue();
  await shot(examiner, 'nguoi-ra-de', '06-lien-ket-ho-tro', {
    marks: [
      {
        at: dialog.getByLabel('Liên kết hỗ trợ'),
        text: 'Liên kết kích hoạt: chỉ hiện một lần, gửi trực tiếp cho sinh viên',
      },
    ],
  });
  await examiner.context().close();

  const phone = await openPage(browser, 'phone');
  await phone.goto('/login');
  await shot(phone, 'nguoi-du-thi', '01-dang-nhap', {
    marks: [
      { at: phone.getByLabel('Tên đăng nhập hoặc email'), text: 'Nhập tên đăng nhập (hoặc email)' },
      { at: phone.getByLabel('Mật khẩu', { exact: true }), text: 'Nhập mật khẩu' },
      { at: phone.getByRole('button', { name: 'Đăng nhập' }), text: 'Bấm Đăng nhập' },
      {
        at: phone.getByRole('link', { name: 'Quên mật khẩu?' }),
        text: 'Quên mật khẩu? Bấm đây để xin liên kết đặt lại',
      },
    ],
  });
  await phone.getByRole('link', { name: 'Quên mật khẩu?' }).click();
  await expect(phone).toHaveURL(/forgot-password/);
  await shot(phone, 'nguoi-du-thi', '02-quen-mat-khau');

  await phone.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(phone.getByRole('heading', { name: 'Kích hoạt tài khoản' })).toBeVisible();
  await phone.getByLabel('Mật khẩu mới').fill('hoa-sen-no-sang-2026');
  await phone.getByLabel('Nhập lại mật khẩu').fill('hoa-sen-no-sang-2026');
  await shot(phone, 'nguoi-du-thi', '03-kich-hoat-tai-khoan', {
    marks: [
      { at: phone.getByLabel('Mật khẩu mới'), text: 'Đặt mật khẩu mới (ít nhất 10 ký tự)' },
      { at: phone.getByLabel('Nhập lại mật khẩu'), text: 'Nhập lại mật khẩu' },
      { at: phone.getByRole('button', { name: 'Kích hoạt' }), text: 'Bấm Kích hoạt' },
    ],
  });
  await phone.getByRole('button', { name: 'Kích hoạt' }).click();
  await expect(phone.getByRole('heading', { name: 'Đã kích hoạt tài khoản' })).toBeVisible();
  await shot(phone, 'nguoi-du-thi', '04-da-kich-hoat');
  await phone.context().close();
});

test('Người dự thi: đăng nhập lần đầu, vào thi và làm bài', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await openPage(browser, 'phone');
  await signIn(page, 'sv26001'); // tài khoản bắt buộc đổi mật khẩu ở lần đầu
  await expect(page.getByRole('heading', { name: 'Đổi mật khẩu' })).toBeVisible();
  await page.getByLabel('Mật khẩu hiện tại').fill('mat-khau-demo');
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('mat-khau-moi-cua-an-2026');
  await page.getByLabel('Nhập lại mật khẩu mới').fill('mat-khau-moi-cua-an-2026');
  await shot(page, 'nguoi-du-thi', '05-doi-mat-khau-lan-dau', {
    marks: [
      { at: page.getByLabel('Mật khẩu hiện tại'), text: 'Mật khẩu tạm đã được cấp' },
      { at: page.getByLabel('Mật khẩu mới', { exact: true }), text: 'Mật khẩu mới của bạn' },
      { at: page.getByRole('button', { name: 'Đổi mật khẩu' }), text: 'Bấm Đổi mật khẩu' },
    ],
  });
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByRole('heading', { name: 'Vào thi', level: 1 })).toBeVisible();

  // Vào thi
  await shot(page, 'nguoi-du-thi', '06-vao-thi', {
    marks: [
      { at: page.getByLabel('Mã vào thi'), text: 'Nhập Mã vào thi do giám thị cung cấp' },
      { at: page.getByRole('button', { name: 'Vào thi' }), text: 'Bấm Vào thi' },
    ],
  });
  await page.getByLabel('Mã vào thi').fill('tin101');
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await expect(page.getByRole('button', { name: 'Bắt đầu làm bài' })).toBeVisible();
  await shot(page, 'nguoi-du-thi', '07-xac-nhan-vao-thi', {
    full: true,
    marks: [
      { at: page.getByTestId('my-variant'), text: 'Mã đề của bạn (khi Phiên thi có nhiều Mã đề)' },
      {
        at: page.getByRole('button', { name: 'Bắt đầu làm bài' }),
        text: 'Bấm Bắt đầu làm bài: đồng hồ bắt đầu chạy',
      },
    ],
  });
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);
  await page.getByRole('button', { name: 'Hiển thị' }).click();
  await page
    .getByRole('dialog', { name: 'Hiển thị' })
    .getByText('Từng câu', { exact: true })
    .click();
  await page.keyboard.press('Escape');

  // Câu đầu tiên (Chọn một)
  await expect(page.getByRole('timer', { name: 'Thời gian còn lại' })).toBeVisible();
  await shot(page, 'nguoi-du-thi', '08-man-lam-bai', {
    marks: [
      {
        at: page.getByRole('timer', { name: 'Thời gian còn lại' }),
        text: 'Đồng hồ còn lại (do máy chủ tính)',
      },
      { at: page.getByTestId('attempt-variant'), text: 'Mã đề của bạn' },
      {
        at: page.getByRole('button', { name: 'Hiển thị' }),
        text: 'Aa: đổi cỡ chữ, kiểu chữ, chế độ Từng câu hoặc Cả đề',
      },
      { at: page.getByRole('button', { name: 'Nộp bài' }), text: 'Nộp bài' },
      { at: page.getByRole('radio').first(), text: 'Chọn một phương án: bài tự lưu ngay' },
      {
        at: page.getByRole('button', { name: 'Câu tiếp' }),
        text: 'Câu tiếp, Câu trước: chuyển câu',
      },
      {
        at: page.getByRole('button', { name: /^Danh sách câu/ }),
        text: 'Bảng danh sách câu và tiến độ',
      },
    ],
  });
  await page.getByRole('radio').first().check();
  await expect(page.getByRole('status', { name: 'Trạng thái lưu' })).toContainText('Đã lưu');
  await page.getByRole('button', { name: 'Đánh dấu xem lại' }).click();
  await shot(page, 'nguoi-du-thi', '09-chon-mot-da-chon', {
    marks: [
      {
        at: page.getByRole('status', { name: 'Trạng thái lưu' }),
        text: 'Đã lưu: câu trả lời đã nằm trên máy chủ',
      },
      {
        at: page.getByRole('button', { name: 'Đánh dấu xem lại', pressed: true }),
        text: 'Đánh dấu xem lại để quay lại sau',
      },
    ],
  });

  // Chọn nhiều
  await nextUntil(page, () => page.getByRole('checkbox').first().isVisible());
  await page.getByRole('checkbox').first().check();
  await page.getByRole('checkbox').nth(1).check();
  await shot(page, 'nguoi-du-thi', '10-chon-nhieu', {
    marks: [
      {
        at: page.getByRole('checkbox').first(),
        text: 'Chọn tất cả phương án đúng (được chọn nhiều)',
      },
    ],
  });

  // Chùm đúng/sai
  await nextUntil(page, () =>
    page
      .getByRole('radio', { name: /^Đúng:/ })
      .first()
      .isVisible(),
  );
  await page
    .getByRole('radio', { name: /^Đúng:/ })
    .first()
    .check();
  await shot(page, 'nguoi-du-thi', '11-chum-dung-sai', {
    marks: [
      {
        at: page.getByRole('radio', { name: /^Đúng:/ }).first(),
        text: 'Với mỗi mệnh đề chọn Đúng hoặc Sai',
      },
    ],
  });

  // Tự luận
  await nextUntil(page, () => page.getByRole('textbox', { name: 'Câu trả lời' }).isVisible());
  await page
    .getByRole('textbox', { name: 'Câu trả lời' })
    .fill(
      'RAM là bộ nhớ tạm, mất dữ liệu khi tắt máy. ROM là bộ nhớ chỉ đọc, giữ dữ liệu cố định.',
    );
  await page.getByRole('textbox', { name: 'Câu trả lời' }).blur();
  await shot(page, 'nguoi-du-thi', '12-tu-luan', {
    marks: [
      {
        at: page.getByRole('textbox', { name: 'Câu trả lời' }),
        text: 'Gõ câu trả lời tự luận: tự lưu khi bạn ngừng gõ',
      },
    ],
  });

  // Bảng danh sách câu
  await page.getByRole('button', { name: /^Danh sách câu/ }).click();
  const grid = page.getByRole('dialog', { name: 'Danh sách câu' });
  await shot(page, 'nguoi-du-thi', '13-danh-sach-cau', {
    marks: [
      {
        at: grid.getByRole('button', { name: /chưa làm/ }).first(),
        text: 'Câu chưa làm (bấm để nhảy tới câu đó)',
      },
      {
        at: grid.getByRole('button', { name: /đánh dấu/ }).first(),
        text: 'Câu đã đánh dấu xem lại',
      },
    ],
  });
  await page.keyboard.press('Escape');

  // Hộp Hiển thị (Aa) và Hướng dẫn
  await page.getByRole('button', { name: 'Hiển thị' }).click();
  await shot(page, 'nguoi-du-thi', '14-hien-thi-aa');
  await page.keyboard.press('Escape');

  // Nộp bài
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  const submit = page.getByRole('dialog').last();
  await shot(page, 'nguoi-du-thi', '15-hop-nop-bai');
  await submit
    .getByRole('button', { name: /^Nộp bài/ })
    .last()
    .click();
  await expect(page.getByRole('heading', { name: 'Đã nộp' })).toBeVisible({ timeout: 30_000 });
  await shot(page, 'nguoi-du-thi', '16-da-nop');
});
