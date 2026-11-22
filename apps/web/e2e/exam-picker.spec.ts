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
  // Song song cho nhanh: nạp tuần tự 25 câu có thể mất hơn 30 giây trên máy CI chậm.
  await Promise.all(
    Array.from({ length: 25 }, async (_, k) => {
      const res = await page.request.post('/api/questions', {
        headers,
        data: {
          type: 'single_choice',
          topicId,
          stem: rich(`Câu CN ${String(k + 1).padStart(2, '0')}`),
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
    }),
  );
}

test('chọn cả trang, Shift + tick chọn dải, giữ lựa chọn qua trang và bộ lọc, rồi thêm vào Bộ đề', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const p = testInfo.project.name;
  // Tên Chủ đề riêng mỗi lần chạy (kể cả khi CI chạy lại): lọc theo Chủ đề này nên luôn đúng 25 câu.
  const topicName = `Chọn nhiều ${p} ${Date.now()}`;
  await signIn(page, `e2e-cn-${p}`);
  await seed(page, topicName);

  await page.goto('/examiner/exams');
  await page.getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await page.getByRole('dialog').getByLabel('Tên Bộ đề').fill('Đề chọn nhiều');
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await expect(page.getByRole('heading', { name: 'Đề chọn nhiều', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
  await dialog.getByLabel('Chủ đề').selectOption({ label: topicName });
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

const LONG =
  'Chọn các phương án phù hợp cho các câu hỏi dưới đây, mỗi câu có thể có nhiều đáp án đúng trong cùng một Phần';

/** Bộ đề nháp hai Phần dựng qua API (Phần 2 có tên rất dài), cùng ba câu trong ngân hàng. Trả mã Bộ đề. */
async function seedTwoSections(page: Page, tag: string) {
  const blank = { type: 'doc', content: [{ type: 'paragraph' }] };
  const headers = { origin: ORIGIN };
  const topic = await page.request.post('/api/topics', { headers, data: { name: `Đích ${tag}` } });
  expect(topic.ok(), await topic.text()).toBe(true);
  const topicId = (await topic.json()).id;
  for (const n of [1, 2, 3]) {
    const res = await page.request.post('/api/questions', {
      headers,
      data: {
        type: 'single_choice',
        topicId,
        stem: rich(`Câu đích ${n}`),
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
  const created = await page.request.post('/api/exams', {
    headers,
    data: { title: `Đề đích ${tag}` },
  });
  const exam = await created.json();
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: `Đề đích ${tag}`,
      instructions: blank,
      version: exam.version,
      sections: [
        { id: exam.sections[0].id, title: 'Phần 1: Chương 4', instructions: blank, items: [] },
        { title: LONG, instructions: blank, items: [] },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return exam.id as string;
}

test('hộp thêm câu cho biết đang thêm vào Phần nào; nút ngắn gọn dù tên Phần dài; đổi Phần ngay trong hộp', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-ptd-${p}`);
  const tag = `${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  const examId = await seedTwoSections(page, tag);
  await page.goto(`/examiner/exams/${examId}`);

  // Mở từ nút của Phần 2 (tên rất dài).
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).nth(1).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
  await dialog.getByLabel('Chủ đề').selectOption({ label: `Đích ${tag}` });

  // Ngay đầu hộp: ô "Thêm vào Phần" đang chọn đúng Phần 2.
  const target = dialog.getByLabel('Thêm vào Phần');
  await expect(target).toBeVisible();
  await expect(target.locator('option:checked')).toContainText('Chọn các phương án phù hợp');

  await dialog.getByRole('checkbox', { name: 'Chọn câu: Câu đích 1' }).check();
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/hop-them-cau-${p}.png` });
  // Nút chính ngắn gọn, cố định; tên đầy đủ nằm ở dòng đích cạnh nút và ở tên truy cập của nút.
  const add = dialog.getByRole('button', { name: /^Thêm 1 câu/ });
  await expect(add).toHaveText('Thêm 1 câu');
  const box = await add.boundingBox();
  // Máy tính: nút gọn theo chữ; điện thoại: nút rộng hết hàng cho dễ chạm. Cả hai đều một dòng, không bị kéo cao.
  if (p === 'desktop') expect(box?.width ?? 999, 'bề rộng nút Thêm').toBeLessThan(220);
  expect(box?.height ?? 999, 'chiều cao nút Thêm').toBeLessThan(64);
  await expect(add).toHaveAccessibleName(/vào Chọn các phương án phù hợp/);
  await expect(dialog.getByTestId('picker-destination')).toContainText(
    'Chọn các phương án phù hợp',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    'tràn ngang',
  ).toBe(0);

  // Đổi đích sang Phần 1 ngay trong hộp: lựa chọn giữ nguyên, câu vào Phần 1.
  await target.selectOption({ label: 'Phần 1: Chương 4 (0 câu)' });
  await expect(dialog.getByTestId('picker-destination')).toContainText('Phần 1: Chương 4');
  await expect(dialog.getByRole('checkbox', { name: 'Chọn câu: Câu đích 1' })).toBeChecked();
  await dialog.getByRole('button', { name: /^Thêm 1 câu/ }).click();
  await expect(dialog).toBeHidden();
  const cards = page.locator('[data-testid="draw-row"]');
  await expect(cards).toHaveCount(1); // chỉ Phần có câu mới có dòng Rút câu: Phần 1
  await expect(page.getByText('Phần này chưa có câu hỏi.')).toHaveCount(1); // Phần 2 vẫn trống
});
