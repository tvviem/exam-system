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
  await seed(page, `Chọn nhiều ${p}`);

  await page.goto('/examiner/exams');
  await page.getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await page.getByRole('dialog').getByLabel('Tên Bộ đề').fill('Đề chọn nhiều');
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await expect(page.getByRole('heading', { name: 'Đề chọn nhiều', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
  const count = (n: number) => dialog.getByText(new RegExp(`^Đã chọn ${n} câu`));
  const box = (n: number) =>
    dialog.getByRole('checkbox', { name: `Chọn câu: Câu CN ${String(n).padStart(2, '0')}` });
  await expect(dialog.getByRole('checkbox', { name: /^Chọn câu:/ })).toHaveCount(20);
  await expect(count(0)).toBeVisible();

  // Chọn cả trang hiện tại: 20 câu, đo thời gian phản hồi.
  const selectPage = dialog.getByRole('checkbox', { name: 'Chọn cả 20 câu trên trang này' });
  const started = performance.now();
  await selectPage.check();
  await expect(count(20)).toBeVisible();
  const pageMs = performance.now() - started;
  console.log(`[đo] chọn cả trang 20 câu: ${pageMs.toFixed(0)} ms`);
  expect(pageMs).toBeLessThan(500);

  // Danh sách xếp mới nhất trước: trang 1 là câu 25 đến 06, trang 2 là câu 05 đến 01.
  // Sang trang 2 vẫn nhớ; chọn cả trang 2 (5 câu).
  await dialog.getByRole('button', { name: 'Trang sau' }).click();
  await expect(box(1)).toBeVisible();
  await expect(count(20)).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Chọn cả 5 câu trên trang này' }).check();
  await expect(count(25)).toBeVisible();

  // Quay lại trang 1: các câu vẫn được tick.
  await dialog.getByRole('button', { name: 'Trang trước' }).click();
  await expect(box(25)).toBeChecked();

  // Bỏ chọn tất cả, rồi Shift + tick chọn dải câu 20 đến 16.
  await dialog.getByRole('button', { name: 'Bỏ chọn tất cả' }).click();
  await expect(count(0)).toBeVisible();
  await box(20).click();
  await box(16).click({ modifiers: ['Shift'] });
  await expect(count(5)).toBeVisible();
  for (const n of [20, 19, 18, 17, 16]) await expect(box(n)).toBeChecked();
  await expect(box(21)).not.toBeChecked();
  await expect(box(15)).not.toBeChecked();

  // Đổi bộ lọc (tìm kiếm) rồi xóa bộ lọc: lựa chọn không mất.
  await dialog.getByLabel('Tìm câu hỏi').fill('CN 21');
  await expect(dialog.getByRole('checkbox', { name: /^Chọn câu:/ })).toHaveCount(1);
  await expect(count(5)).toBeVisible();
  await dialog.getByLabel('Tìm câu hỏi').fill('');
  await expect(box(18)).toBeChecked();
  await expect(count(5)).toBeVisible();

  // Thêm vào Bộ đề: 5 câu, đúng các câu đã chọn.
  await dialog.getByRole('button', { name: 'Thêm 5 câu vào Phần 1' }).click();
  await expect(page.getByText('5 câu · 5 điểm')).toBeVisible();

  // Mở lại: 5 câu đã có hiện "Đã có", cả trang 1 chỉ còn 15 câu chọn được.
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
