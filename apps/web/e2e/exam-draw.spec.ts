import { expect, type Page, test } from '@playwright/test';

// R4a (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 4.6, 8): tỷ lệ rút của từng Phần khi soạn Bộ đề.

const PASSWORD = 'mat-khau-on-dinh';
const ORIGIN = 'http://localhost:4173'; // server chặn yêu cầu ghi không có Origin
const headers = { origin: ORIGIN };

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Văn bản có định dạng; chuỗi rỗng thành đoạn trống (nút chữ rỗng bị server từ chối). */
const rich = (text: string) => ({
  type: 'doc',
  content: [
    text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
  ],
});

/** Bộ đề nháp hai Phần dựng qua API: Phần I 10 câu × 1 điểm, Phần II 5 câu × 2 điểm. Trả mã Bộ đề. */
async function seedExam(page: Page, tag: string) {
  const topic = await page.request.post('/api/topics', {
    headers,
    data: { name: `Rút câu ${tag}` },
  });
  expect(topic.ok(), await topic.text()).toBe(true);
  const topicId = (await topic.json()).id;
  const question = async (n: number) => {
    const res = await page.request.post('/api/questions', {
      headers,
      data: {
        type: 'single_choice',
        topicId,
        stem: rich(`Câu hỏi ${n}`),
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
    return (await res.json()).id as string;
  };
  const ids: string[] = [];
  for (let n = 1; n <= 15; n++) ids.push(await question(n));
  const created = await page.request.post('/api/exams', {
    headers,
    data: { title: `Bộ đề rút câu ${tag}` },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const exam = await created.json();
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: `Bộ đề rút câu ${tag}`,
      instructions: rich(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: 'Phần I',
          instructions: rich(''),
          items: ids.slice(0, 10).map((questionId) => ({ questionId, points: 1 })),
        },
        {
          title: 'Phần II',
          instructions: rich(''),
          items: ids.slice(10).map((questionId) => ({ questionId, points: 2 })),
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return exam.id as string;
}

/** Chụp ảnh để xem bằng mắt khi đặt SHOTS=<thư mục> (không chụp trong CI). */
const shot = async (page: Page, name: string) => {
  if (!process.env.SHOTS) return;
  // Ảnh theo khung nhìn thật (kể cả thanh hành động dính), cuộn tới dòng Rút câu đầu tiên.
  await page
    .locator('[data-testid="draw-row"]')
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${process.env.SHOTS}/rut-cau-${name}.png` });
};

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Tên Chủ đề không được trùng trong một tài khoản: mỗi lần chạy (kể cả chạy lại khi lỗi, lặp lại) dùng tên riêng. */
const runId = (testInfo: { retry: number; repeatEachIndex: number }) =>
  `${testInfo.repeatEachIndex}-${testInfo.retry}`;

const percentInput = (page: Page, n: number) =>
  page.getByRole('textbox', { name: /^Tỷ lệ rút của Phần/ }).nth(n);

test('Rút câu ở Bộ đề: đặt tỷ lệ từng Phần, thấy số câu mỗi người nhận, báo lệch điểm, lưu, Phát hành', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-rc-${p}`);
  const examId = await seedExam(page, `${p}-${runId(testInfo)}`);
  await page.goto(`/examiner/exams/${examId}`);

  // Mặc định: lấy đủ, như trước khi có Rút câu; chưa có dòng tổng hợp rút câu.
  await expect(page.getByText('→ lấy đủ 10 câu')).toBeVisible();
  await expect(page.getByText('→ lấy đủ 5 câu')).toBeVisible();
  // Chú thích "100 % là lấy đủ" chỉ hiện một lần, không lặp ở mọi Phần.
  await expect(page.getByText(/^100 % là lấy đủ mọi câu/)).toHaveCount(1);
  await expect(page.getByText('15 câu · 20 điểm')).toBeVisible();
  await expect(page.getByTestId('draw-summary')).toHaveCount(0);
  await expect(percentInput(page, 0)).toHaveValue('100');

  // 40 % của 10 câu là 4 câu; Phần II để 100 %: mỗi người 9 câu, tối đa 14 điểm.
  await percentInput(page, 0).fill('40');
  await expect(page.getByText('→ mỗi người nhận 4/10 câu')).toBeVisible();
  await expect(
    page.getByTestId('draw-summary').getByText('Mỗi Người dự thi nhận 9 câu, tối đa 14 điểm.'),
  ).toBeVisible();
  expect(await overflow(page), 'trang soạn có rút câu').toBe(0);

  // Số sai: khóa Lưu và báo ngay cạnh ô; dấu phẩy hợp lệ.
  for (const bad of ['150', '33,333', '-5', '']) {
    await percentInput(page, 0).fill(bad);
    await expect(page.getByText('Nhập số từ 0 đến 100, tối đa hai chữ số lẻ.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  }
  await percentInput(page, 0).fill('12,5');
  await expect(page.getByText('→ mỗi người nhận 1/10 câu')).toBeVisible(); // 1,25 làm tròn 1
  await percentInput(page, 0).fill('40');
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeEnabled();

  // Câu khác điểm trong Phần rút dưới 100 %: cảnh báo có chữ (không chỉ màu), lưu vẫn được.
  await page.getByRole('textbox', { name: 'Điểm câu 1', exact: true }).fill('3');
  await expect(page.getByRole('alert').filter({ hasText: 'đang khác điểm' })).toBeVisible();
  // Điểm tối đa không xác định khi còn Phần lệch điểm: chỉ nêu số câu, không hiện số điểm sai.
  await expect(
    page.getByTestId('draw-summary').getByText('Mỗi Người dự thi nhận 9 câu.'),
  ).toBeVisible();
  await expect(page.getByText(/tối đa \d/)).toHaveCount(0);
  await shot(page, `canh-bao-${p}`);
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Bộ đề').last()).toBeVisible();

  // Phát hành bị chặn, nêu đúng Phần lệch.
  await page.getByRole('button', { name: 'Phát hành' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Phát hành Bộ đề' });
  await expect(dialog.getByText(/Phần rút dưới 100 % có các câu khác điểm/)).toBeVisible();
  await expect(dialog.getByText('Phần I')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Phát hành', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');

  // Sửa điểm cho đồng đều thì hết cảnh báo; mở lại trang vẫn giữ 40 %.
  await page.getByRole('textbox', { name: 'Điểm câu 1', exact: true }).fill('1');
  await expect(page.getByRole('alert').filter({ hasText: 'đang khác điểm' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Bộ đề').last()).toBeVisible();
  await page.reload();
  await expect(percentInput(page, 0)).toHaveValue('40');
  await expect(page.getByText('→ mỗi người nhận 4/10 câu')).toBeVisible();

  // Trên điện thoại: ô tỷ lệ đủ lớn để chạm, không tràn ngang.
  if (p === 'mobile') {
    const box = await percentInput(page, 0).boundingBox();
    expect(box?.height ?? 0, 'vùng chạm ô tỷ lệ').toBeGreaterThanOrEqual(44);
  }
  expect(await overflow(page), 'sau khi mở lại').toBe(0);
  await shot(page, `form-40-${p}`);

  // Phát hành xong: chỉ đọc, hiện tỷ lệ đã đóng băng và không còn ô nhập.
  await page.getByRole('button', { name: 'Phát hành' }).first().click();
  await dialog.getByRole('button', { name: 'Phát hành', exact: true }).click();
  await expect(page.getByText('Đã Phát hành Bộ đề')).toBeVisible();
  await expect(page.getByText('40 %', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Tỷ lệ rút của Phần/ })).toHaveCount(0);
});

test('mọi Phần 0 % bị báo: Người dự thi sẽ không có câu nào, và Phát hành bị chặn', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-rc0-${p}`);
  const examId = await seedExam(page, `${p}-0-${runId(testInfo)}`);
  await page.goto(`/examiner/exams/${examId}`);
  await percentInput(page, 0).fill('0');
  await expect(page.getByText('→ mỗi người nhận 0/10 câu')).toBeVisible();
  await percentInput(page, 1).fill('0');
  await expect(page.getByRole('alert').filter({ hasText: 'Mọi Phần đều 0 %' })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Bộ đề').last()).toBeVisible();
  await page.getByRole('button', { name: 'Phát hành' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Phát hành Bộ đề' });
  await expect(dialog.getByText(/Mọi Phần đều 0 %/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Phát hành', exact: true })).toBeDisabled();
});
