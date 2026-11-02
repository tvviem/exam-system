import { expect, test } from '@playwright/test';
import { examinerPage, ORIGIN, overflow, seedOpenSession, signIn } from './take-support';

test('Làm bài: nhập mã, xác nhận, làm bốn Loại câu ở hai chế độ, lưới, đánh dấu, lưu, Nộp bài', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const code = `TKE2E${tag}`;
  const examiner = await examinerPage(browser, `e2e-lb-gv-${p}`);
  await seedOpenSession(examiner, p, code, `TK-${tag}-001`);

  await signIn(page, `e2e-lb-sv-${p}`);
  await page.goto('/take');
  await expect(page.getByRole('heading', { name: 'Vào thi' })).toBeVisible();
  // Phiên thi của tôi: nhóm Đang mở, dòng có nút nhập mã
  await expect(page.getByRole('heading', { name: 'Đang mở' })).toBeVisible();
  await expect(page.getByRole('heading', { name: `Ca làm bài ${p}`, exact: true })).toBeVisible();
  expect(await overflow(page), 'trang Vào thi').toBe(0);

  // Mã sai: một lỗi chung, hiện ngay dưới ô
  const input = page.getByLabel('Mã vào thi');
  await input.fill('SAI123');
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await expect(page.getByText('Mã vào thi không đúng')).toBeVisible();

  // Mã đúng viết thường có khoảng trắng: tự chuẩn hóa
  await input.fill(` ${code.toLowerCase()} `);
  await expect(input).toHaveValue(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();

  // Màn xác nhận
  await expect(page.getByRole('heading', { name: `Ca làm bài ${p}` })).toBeVisible();
  await expect(page.getByText(`Đề làm bài ${p}`)).toBeVisible();
  await expect(page.getByText('30 phút')).toBeVisible();
  await expect(page.getByText('4 câu')).toBeVisible();
  await expect(page.getByText(/thiết bị.*địa chỉ IP/)).toBeVisible();
  expect(await overflow(page), 'màn xác nhận').toBe(0);
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();

  // Làm bài
  await page.waitForURL(/\/take\/attempts\//);
  await expect(page.getByRole('timer', { name: 'Thời gian còn lại' })).toBeVisible();
  await expect(page.getByRole('timer')).toContainText(/^(29|30):\d\d$/);

  // Chế độ "Từng câu": mỗi lần một câu
  await page.getByRole('button', { name: 'Từng câu' }).click();
  await expect(page.getByText(`Thủ đô của Việt Nam ${p}?`)).toBeVisible();
  await expect(page.getByText(`Chọn các số nguyên tố ${p}`)).toBeHidden();
  await page.getByRole('radio', { name: 'Hà Nội' }).check();
  await expect(page.getByRole('status', { name: 'Trạng thái lưu' })).toContainText('Đã lưu');

  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await page.getByRole('checkbox', { name: 'hai' }).check();
  await page.getByRole('checkbox', { name: 'bảy' }).check();
  await page.getByRole('button', { name: 'Đánh dấu xem lại' }).click();
  await expect(page.getByRole('button', { name: 'Bỏ đánh dấu' })).toBeVisible();

  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  // Chùm đúng/sai: mới trả lời một Mệnh đề là "làm dở"
  await page.getByRole('radio', { name: 'Đúng: đồng biến trên R' }).check();

  // Lưới số câu
  await page.getByRole('button', { name: 'Danh sách câu' }).click();
  const grid = page.getByRole('dialog', { name: 'Danh sách câu' });
  await expect(grid.getByRole('button', { name: 'Câu 1, đã làm' })).toBeVisible();
  await expect(grid.getByRole('button', { name: 'Câu 2, đã làm, đánh dấu' })).toBeVisible();
  await expect(grid.getByRole('button', { name: 'Câu 3, làm dở' })).toBeVisible();
  await expect(grid.getByRole('button', { name: 'Câu 4, chưa làm' })).toBeVisible();
  expect(await overflow(page), 'lưới số câu').toBe(0);
  await grid.getByRole('button', { name: 'Câu 4, chưa làm' }).click();
  await expect(page.getByText(`Trình bày định nghĩa giới hạn ${p}`)).toBeVisible();

  // Tự luận lưu sau khi ngừng gõ
  await page.getByRole('textbox', { name: 'Bài làm' }).fill('Giới hạn là giá trị tiến tới.');
  await expect(page.getByRole('status', { name: 'Trạng thái lưu' })).toContainText('Đã lưu');

  // Chế độ "Cả đề": thấy mọi câu
  await page.getByRole('button', { name: 'Cả đề' }).click();
  await expect(page.getByText(`Thủ đô của Việt Nam ${p}?`)).toBeVisible();
  await expect(page.getByText(`Chọn các số nguyên tố ${p}`)).toBeVisible();
  expect(await overflow(page), 'chế độ Cả đề').toBe(0);

  // Tải lại: Câu trả lời đã nằm ở server, đánh dấu còn nguyên
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Hà Nội' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'bảy' })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Bài làm' })).toHaveValue(
    'Giới hạn là giá trị tiến tới.',
  );
  await expect(page.getByRole('button', { name: 'Bỏ đánh dấu' })).toHaveCount(1);

  // Nộp bài: hộp thoại nêu câu làm dở và câu đánh dấu
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  const confirm = page.getByRole('dialog', { name: 'Nộp bài?' });
  await expect(confirm).toContainText('1 câu làm dở');
  await expect(confirm).toContainText('1 câu đánh dấu');
  await confirm.getByRole('button', { name: 'Làm tiếp' }).click();
  await expect(confirm).toBeHidden();
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await page
    .getByRole('dialog', { name: 'Nộp bài?' })
    .getByRole('button', { name: 'Nộp bài' })
    .click();

  // Đã nộp: không còn nội dung đề
  await expect(page.getByRole('heading', { name: 'Đã nộp' })).toBeVisible();
  await expect(page.getByText(`Thủ đô của Việt Nam ${p}?`)).toBeHidden();
  await page.getByRole('link', { name: 'Về danh sách Phiên thi' }).click();
  await expect(page.getByRole('heading', { name: 'Đã xong' })).toBeVisible();
  await expect(page.getByText('Đã nộp 1/1 lượt')).toBeVisible();
});

test('Thiết bị thứ hai không vào được Phiên thi đã gắn thiết bị khác', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const code = `TKDV${tag}`;
  const examiner = await examinerPage(browser, `e2e-lb-gv-${p}`);
  await seedOpenSession(examiner, `${p}-tb`, code, `TK-${tag}-001`);

  await signIn(page, `e2e-lb-sv-${p}`);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await expect(page.getByRole('button', { name: 'Bắt đầu làm bài' })).toBeVisible();

  const other = await browser.newContext({ baseURL: ORIGIN });
  const second = await other.newPage();
  await signIn(second, `e2e-lb-sv-${p}`);
  await second.goto('/take');
  await second.getByLabel('Mã vào thi').fill(code);
  await second.getByRole('button', { name: 'Vào thi' }).click();
  await expect(second.getByText('Bạn đã vào Phiên thi này trên một thiết bị khác')).toBeVisible();
});
