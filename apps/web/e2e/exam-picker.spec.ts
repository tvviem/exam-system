import { expect, type Page, test } from '@playwright/test';

// Hộp "Thêm câu hỏi vào Bộ đề": chọn cả trang, Shift + tick chọn dải, lựa chọn giữ qua trang và bộ lọc.

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
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** 25 câu "Câu CN 01".."Câu CN 25" trong một Chủ đề (trang 1 có 20 câu, trang 2 có 5). */
async function seed(page: Page, topicName: string) {
  const headers = { origin: ORIGIN };
  const topic = await page.request.post('/api/topics', { headers, data: { name: topicName } });
  expect(topic.ok(), await topic.text()).toBe(true);
  const topicId = (await topic.json()).id;
  for (let i = 1; i <= 25; i++) {
    const res = await page.request.post('/api/questions', {
      headers,
      data: {
        type: 'single_choice',
        topicId,
        stem: rich(`Câu CN ${String(i).padStart(2, '0')}`),
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
      },
    });
    expect(res.ok(), await res.text()).toBe(true);
  }
}

test('chọn cả trang, Shift + tick chọn dải, giữ lựa chọn qua trang và bộ lọc, rồi thêm vào Bộ đề', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-cn-${p}`);
  await seed(page, `Chọn nhiều ${p} ${Date.now()}`);

  await page.goto('/examiner/exams');
  await page.getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await page.getByRole('dialog').getByLabel('Tên Bộ đề').fill('Đề chọn nhiều');
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await expect(page.getByRole('heading', { name: 'Đề chọn nhiều', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
  const count = (n: number) => dialog.getByText(new RegExp(`^Đã chọn ${n} câu`));
  const boxes = dialog.getByRole('checkbox', { name: /^Chọn câu:/ });
  await expect(boxes).toHaveCount(20);
  await expect(count(0)).toBeVisible();
  // Thứ tự danh sách không phải điều cần kiểm: chỉ dùng vị trí và nhãn của từng hàng.
  const label = (n: number) => boxes.nth(n).getAttribute('aria-label');

  // Chọn cả trang hiện tại: 20 câu, đo thời gian phản hồi.
  const first = await label(0);
  const selectPage = dialog.getByRole('checkbox', { name: 'Chọn cả 20 câu trên trang này' });
  const started = performance.now();
  await selectPage.check();
  await expect(count(20)).toBeVisible();
  const pageMs = performance.now() - started;
  console.log(`[đo] chọn cả trang 20 câu: ${pageMs.toFixed(0)} ms`);
  expect(pageMs).toBeLessThan(500);

  // Sang trang 2 (5 câu) vẫn nhớ 20 câu; chọn cả trang 2.
  await dialog.getByRole('button', { name: 'Trang sau' }).click();
  await expect(boxes).toHaveCount(5);
  await expect(count(20)).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Chọn cả 5 câu trên trang này' }).check();
  await expect(count(25)).toBeVisible();

  // Quay lại trang 1: các câu vẫn được tick.
  await dialog.getByRole('button', { name: 'Trang trước' }).click();
  await expect(boxes).toHaveCount(20);
  await expect(dialog.getByRole('checkbox', { name: first ?? '' })).toBeChecked();

  // Bỏ chọn tất cả, rồi Shift + tick chọn dải từ hàng thứ 3 đến hàng thứ 7.
  await dialog.getByRole('button', { name: 'Bỏ chọn tất cả' }).click();
  await expect(count(0)).toBeVisible();
  const third = await label(2);
  await boxes.nth(2).click();
  await boxes.nth(6).click({ modifiers: ['Shift'] });
  await expect(count(5)).toBeVisible();
  for (const n of [2, 3, 4, 5, 6]) await expect(boxes.nth(n)).toBeChecked();
  await expect(boxes.nth(1)).not.toBeChecked();
  await expect(boxes.nth(7)).not.toBeChecked();

  // Đổi bộ lọc (tìm kiếm) rồi xóa bộ lọc: lựa chọn không mất.
  const stem = (await label(10))?.replace('Chọn câu: ', '') ?? '';
  await dialog.getByLabel('Tìm câu hỏi').fill(stem);
  await expect(boxes).toHaveCount(1);
  await expect(count(5)).toBeVisible();
  await dialog.getByLabel('Tìm câu hỏi').fill('');
  await expect(boxes).toHaveCount(20);
  await expect(dialog.getByRole('checkbox', { name: third ?? '' })).toBeChecked();
  await expect(count(5)).toBeVisible();

  // Thêm vào Bộ đề: 5 câu.
  await dialog.getByRole('button', { name: 'Thêm 5 câu vào Phần 1' }).click();
  await expect(page.getByText('5 câu · 5 điểm')).toBeVisible();

  // Mở lại: 5 câu đã có không chọn lại được, trang 1 còn 15 câu chọn được.
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).first().click();
  await expect(
    dialog.getByRole('checkbox', { name: 'Chọn cả 15 câu trên trang này' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
});
