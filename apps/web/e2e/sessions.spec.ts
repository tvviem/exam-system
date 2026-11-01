import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';
const ORIGIN = 'http://localhost:4173'; // server chặn yêu cầu ghi không có Origin

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

const rich = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }],
});

/** Bộ đề đã Phát hành (2 câu chọn một), dựng qua API cho nhanh. */
async function seedPublishedExam(page: Page, title: string) {
  const headers = { origin: ORIGIN };
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `Chủ đề ${title}` });
  const items: { questionId: string; points: number }[] = [];
  for (const stem of ['Câu A', 'Câu B']) {
    const question = await post('/api/questions', {
      type: 'single_choice',
      topicId: topic.id,
      stem: rich(stem),
      defaultPoints: 1,
      tags: [],
      payload: {
        options: [
          { id: 'o1', content: rich('a') },
          { id: 'o2', content: rich('b') },
        ],
        key: ['o1'],
        shuffleOptions: true,
      },
    });
    items.push({ questionId: question.id, points: 1 });
  }
  const exam = await post('/api/exams', { title });
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title,
      instructions: rich(''),
      version: exam.version,
      sections: [{ id: exam.sections[0].id, title: null, instructions: rich(''), items }],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await post(`/api/exams/${exam.id}/publish`, { version: (await saved.json()).version });
}

/** Mở menu "…" của một dòng. Menu đóng khi trang cuộn, nên cuộn tới nút trước rồi mới bấm. */
async function openRowMenu(page: Page, name: string) {
  const button = page.getByRole('button', { name });
  await button.scrollIntoViewIfNeeded();
  await button.click();
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('Phiên thi: tạo 3 bước, thêm người, phút cộng sẵn, sửa, nhân bản, hủy', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  await signIn(page, `e2e-pt-${p}`);
  await seedPublishedExam(page, `Giữa kỳ ${p}`);

  // Danh sách trống
  await page.goto('/examiner/sessions');
  await expect(page.getByText('Chưa có Phiên thi nào.')).toBeVisible();
  expect(await overflow(page), 'danh sách trống').toBe(0);

  // Bước 1: Bộ đề và tên
  await page.getByRole('link', { name: 'Tạo Phiên thi' }).click();
  await expect(page.getByText('Bước 1/3: Bộ đề và tên')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tiếp' })).toBeDisabled();
  await page
    .getByLabel('Bộ đề', { exact: true })
    .selectOption({ label: `Giữa kỳ ${p} (2 câu, 2 điểm)` });
  await page.getByLabel('Tên Phiên thi').fill(`Ca 1 ${p}`);
  await page.getByRole('button', { name: 'Tiếp' }).click();

  // Bước 2: Thời gian (giờ Việt Nam)
  await expect(page.getByText('Bước 2/3: Thời gian')).toBeVisible();
  await page.getByLabel('Giờ mở').fill('2030-01-10T08:00');
  await page.getByLabel('Giờ đóng').fill('2030-01-10T07:00');
  await expect(page.getByText('Giờ đóng phải sau giờ mở.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tiếp' })).toBeDisabled();
  await page.getByLabel('Giờ đóng').fill('2030-01-10T10:00');
  await expect(page.getByText('GMT+7').first()).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp' }).click();

  // Bước 3: Thiết lập làm bài, mã được gợi ý sẵn
  await expect(page.getByText('Bước 3/3: Thiết lập làm bài')).toBeVisible();
  const code = page.getByLabel('Mã vào thi');
  await expect(code).toHaveValue(/^[A-Z2-9]{6}$/);
  expect(await overflow(page), 'bước 3').toBe(0);
  const first = await code.inputValue();
  await page.getByRole('button', { name: 'Gợi ý mã khác' }).click();
  await expect(code).not.toHaveValue(first);
  await page.getByLabel('Số lượt làm bài tối đa').selectOption('2');
  await expect(page.getByLabel('Điểm khi làm nhiều lượt')).toBeVisible();
  await page.getByRole('button', { name: 'Tạo Phiên thi' }).click();

  // Sang tab Danh sách dự thi
  await expect(page.getByRole('heading', { name: `Ca 1 ${p}` })).toBeVisible();
  await expect(page.getByText('Sắp mở')).toBeVisible();
  await expect(page.getByText('Danh sách còn trống')).toBeVisible();

  // Thêm cả Lớp
  await page.getByLabel('Tìm theo tên, Mã định danh hoặc Lớp').fill(`LOP-${tag}-A`);
  await page.getByRole('button', { name: `Thêm cả lớp LOP-${tag}-A (2 người)` }).click();
  await expect(page.getByText('Đã thêm 2 người.')).toBeVisible();
  const rows = page.getByRole('listitem').filter({ hasText: `(${p})` });
  await expect(rows).toHaveCount(2);

  // Dán danh sách mã: một mã khớp, một mã không có
  await page.getByRole('button', { name: 'Dán danh sách Mã định danh' }).click();
  const dialog = page.getByRole('dialog', { name: 'Dán danh sách Mã định danh' });
  await dialog.getByLabel('Danh sách Mã định danh').fill(`PT-${tag}-001\nPT-${tag}-003\nKHONGCO`);
  await dialog.getByRole('button', { name: 'Kiểm tra' }).click();
  await expect(dialog.getByText('Khớp 1 người mới; 1 người đã có trong Danh sách.')).toBeVisible();
  await expect(dialog.getByText('1 mã không tìm thấy: KHONGCO')).toBeVisible();
  await dialog.getByRole('button', { name: 'Thêm 1 người' }).click();
  await expect(rows).toHaveCount(3);

  // Phút cộng sẵn, giữ nguyên sau khi tải lại
  const extra = page.getByLabel(`Phút cộng sẵn của Nguyễn Văn An (${p})`);
  await extra.fill('15');
  await extra.blur();
  await page.reload();
  await expect(page.getByLabel(`Phút cộng sẵn của Nguyễn Văn An (${p})`)).toHaveValue('15');

  // Bớt một người bằng menu
  await openRowMenu(page, `Thao tác với Lê Văn Cường (${p})`);
  await page.getByRole('menuitem', { name: 'Bớt' }).click();
  await expect(rows).toHaveCount(2);

  // Cấp lại mật khẩu tạm: tài khoản này không do Yêu cầu cấp tài khoản của mình tạo nên bị từ chối
  await openRowMenu(page, `Thao tác với Nguyễn Văn An (${p})`);
  await page.getByRole('menuitem', { name: 'Cấp lại mật khẩu tạm' }).click();
  await page.getByRole('button', { name: 'Cấp mật khẩu mới' }).click();
  const refused = page.getByRole('alert').filter({
    hasText: 'Chỉ cấp lại được cho tài khoản do chính bạn xin cấp',
  });
  await expect(refused).toBeVisible();
  await refused.getByRole('button', { name: 'Đóng' }).click(); // toast lỗi ở lại tới khi đóng

  // Tổng quan và sửa
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  await expect(page.getByTestId('access-code')).toHaveText(/^[A-Z2-9]{6}$/);
  expect(await overflow(page), 'tổng quan').toBe(0);
  await page.getByRole('button', { name: 'Sửa' }).click();
  await page.getByLabel('Tên Phiên thi').fill(`Ca 1 sửa ${p}`);
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByRole('heading', { name: `Ca 1 sửa ${p}` })).toBeVisible();

  // Nhân bản: bản sao Sắp mở, mang theo Danh sách
  await page.getByRole('button', { name: 'Nhân bản' }).click();
  await expect(page.getByRole('heading', { name: `Ca 1 sửa ${p} (bản sao)` })).toBeVisible();
  await page.getByRole('tab', { name: 'Danh sách dự thi' }).click();
  await expect(rows).toHaveCount(2);

  // Hủy bản sao: không hoàn tác, không sửa được nữa
  await page.getByRole('button', { name: 'Hủy Phiên thi' }).click();
  const cancel = page.getByRole('dialog', { name: 'Hủy Phiên thi này?' });
  await cancel.getByLabel('Lý do (không bắt buộc)').fill('Trùng lịch');
  await cancel.getByRole('button', { name: 'Hủy Phiên thi' }).click();
  await expect(page.getByText('Đã hủy', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sửa' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Hủy Phiên thi' })).toBeDisabled();

  // Danh sách: lọc theo trạng thái
  await page.goto('/examiner/sessions');
  await expect(page.getByRole('link', { name: /Ca 1 sửa/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Đã hủy' }).click();
  await expect(page.getByRole('link', { name: /Ca 1 sửa/ })).toHaveCount(1);
  expect(await overflow(page), 'danh sách').toBe(0);
});
