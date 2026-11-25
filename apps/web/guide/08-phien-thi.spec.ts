import { expect, test } from '@playwright/test';
import { openPage, saveState, shot, signIn } from './support';

// Người ra đề: tạo Phiên thi, Danh sách dự thi, Mã đề, Tổng quan (tài liệu nguoi-ra-de.md).

/** Chuỗi `YYYY-MM-DDTHH:mm` theo giờ Việt Nam, lệch `minutes` phút so với bây giờ. */
const local = (minutes: number) => {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(Date.now() + minutes * 60_000));
  return parts.replace(' ', 'T');
};

test('Tạo Phiên thi, Danh sách dự thi, Mã đề', async ({ browser }) => {
  const page = await openPage(browser, 'desktop');
  await signIn(page, 'tran.mai');
  await page.goto('/examiner/sessions');
  await expect(page.getByText('Chưa có Phiên thi nào.')).toBeVisible();
  await shot(page, 'nguoi-ra-de', '50-danh-sach-phien-thi-trong', {
    marks: [
      { at: page.getByRole('link', { name: 'Tạo Phiên thi' }).first(), text: 'Bấm Tạo Phiên thi' },
    ],
  });
  await page.getByRole('link', { name: 'Tạo Phiên thi' }).first().click();

  // Bước 1: Bộ đề và tên
  await expect(page.getByText('Bước 1/3: Bộ đề và tên')).toBeVisible();
  await page
    .getByLabel('Bộ đề', { exact: true })
    .selectOption({ label: 'Kiểm tra giữa kỳ Tin học căn bản' })
    .catch(async () => {
      await page.getByLabel('Bộ đề', { exact: true }).selectOption({ index: 1 });
    });
  await page.getByLabel('Tên Phiên thi').fill('Kiểm tra giữa kỳ - Lớp CNTT-K26');
  await shot(page, 'nguoi-ra-de', '51-phien-thi-buoc-1', {
    marks: [
      { at: page.getByLabel('Bộ đề', { exact: true }), text: 'Chọn Bộ đề đã Phát hành' },
      { at: page.getByLabel('Tên Phiên thi'), text: 'Đặt tên Phiên thi' },
      { at: page.getByRole('button', { name: 'Tiếp' }), text: 'Bấm Tiếp' },
    ],
  });
  await page.getByRole('button', { name: 'Tiếp' }).click();

  // Bước 2: Thời gian (mở ngay để Người dự thi vào thi được)
  await expect(page.getByText('Bước 2/3: Thời gian')).toBeVisible();
  await page.getByLabel('Giờ mở').fill(local(-10));
  await page.getByLabel('Giờ đóng').fill(local(180));
  await shot(page, 'nguoi-ra-de', '52-phien-thi-buoc-2', {
    marks: [
      {
        at: page.getByLabel('Giờ mở'),
        text: 'Giờ mở: từ lúc này Người dự thi nhập Mã vào thi được',
      },
      {
        at: page.getByLabel('Giờ đóng'),
        text: 'Giờ đóng: hết Khung giờ này không vào thi được nữa',
      },
      { at: page.getByRole('button', { name: 'Tiếp' }), text: 'Bấm Tiếp' },
    ],
  });
  await page.getByRole('button', { name: 'Tiếp' }).click();

  // Bước 3: Thiết lập làm bài
  await expect(page.getByText('Bước 3/3: Thiết lập làm bài')).toBeVisible();
  await page.getByLabel('Mã vào thi').fill('TIN101');
  await shot(page, 'nguoi-ra-de', '53-phien-thi-buoc-3', {
    full: true,
    marks: [
      {
        at: page.getByLabel('Mã vào thi'),
        text: 'Mã vào thi: Người dự thi nhập mã này để vào (tự sinh, đổi được)',
      },
      {
        at: page.getByLabel('Số Lượt làm bài tối đa'),
        text: 'Số Lượt làm bài tối đa của mỗi người',
      },
      {
        at: page.getByText('Dùng chung các Mã đề').first(),
        text: 'Cách ra đề: dùng chung các Mã đề, hoặc mỗi người một đề',
      },
      { at: page.getByRole('button', { name: 'Tạo Phiên thi' }), text: 'Bấm Tạo Phiên thi' },
    ],
  });
  const numberOfVariants = page.getByLabel('Số Mã đề');
  if (await numberOfVariants.isVisible().catch(() => false)) await numberOfVariants.fill('2');
  await page.getByRole('button', { name: 'Tạo Phiên thi' }).click();
  await expect(
    page.getByRole('heading', { name: 'Kiểm tra giữa kỳ - Lớp CNTT-K26', level: 1 }),
  ).toBeVisible();
  saveState({ sessionUrl: page.url(), accessCode: 'TIN101' });

  // Danh sách dự thi: thêm cả lớp
  await expect(page.getByText('Danh sách còn trống')).toBeVisible();
  await shot(page, 'nguoi-ra-de', '54-phien-thi-danh-sach-trong', { full: true });
  await page.getByLabel('Tìm theo tên, Mã định danh hoặc Lớp').fill('CNTT-K26');
  const addClass = page.getByRole('button', { name: /^Thêm cả lớp CNTT-K26/ });
  await expect(addClass).toBeVisible();
  await shot(page, 'nguoi-ra-de', '55-them-ca-lop', {
    marks: [
      {
        at: page.getByLabel('Tìm theo tên, Mã định danh hoặc Lớp'),
        text: 'Tìm người theo tên, Mã định danh hoặc Lớp',
      },
      { at: addClass, text: 'Thêm cả lớp vào Danh sách dự thi' },
      {
        at: page.getByRole('button', { name: 'Dán danh sách Mã định danh' }),
        text: 'Hoặc dán danh sách Mã định danh',
      },
    ],
  });
  await addClass.click();
  await expect(page.getByText(/Đã thêm \d+ người/)).toBeVisible();
  await page.getByLabel('Tìm theo tên, Mã định danh hoặc Lớp').fill('');
  await shot(page, 'nguoi-ra-de', '56-danh-sach-co-ma-de', { full: true });

  // Tab Đề và Tổng quan
  await page.getByRole('tab', { name: 'Đề', exact: true }).click();
  await shot(page, 'nguoi-ra-de', '57-tab-de', { full: true });
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  await shot(page, 'nguoi-ra-de', '58-tong-quan-phien-thi', {
    full: true,
    marks: [
      {
        at: page.getByTestId('access-code-card'),
        text: 'Mã vào thi (có nút Sao chép): gửi cho Người dự thi',
      },
      {
        at: page.getByRole('link', { name: 'Xem thử' }),
        text: 'Xem thử Phiên thi đúng như Người dự thi thấy',
      },
    ],
  });
});
