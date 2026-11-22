import { expect, type Page, test } from '@playwright/test';

// Chuyển nhanh giữa các Phần khi soạn Bộ đề nhiều Phần, và bảng "mỗi Người dự thi nhận bao nhiêu câu" trong hộp Phát hành.

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

const rich = (text: string) => ({
  type: 'doc',
  content: [
    text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
  ],
});

/** Bộ đề nháp ba Phần dựng qua API, mọi câu 1 điểm: Phần I 6 câu, Phần II 6 câu, Phần III 3 câu. Trả mã Bộ đề. */
async function seedExam(page: Page, tag: string) {
  const topic = await page.request.post('/api/topics', {
    headers,
    data: { name: `Chuyển Phần ${tag}` },
  });
  expect(topic.ok(), await topic.text()).toBe(true);
  const topicId = (await topic.json()).id;
  const ids: string[] = [];
  for (let n = 1; n <= 15; n++) {
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
    ids.push((await res.json()).id);
  }
  const created = await page.request.post('/api/exams', {
    headers,
    data: { title: `Đề chuyển Phần ${tag}` },
  });
  const exam = await created.json();
  const items = (from: number, to: number) =>
    ids.slice(from, to).map((questionId) => ({ questionId, points: 1 }));
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: `Đề chuyển Phần ${tag}`,
      instructions: rich(''),
      version: exam.version,
      sections: [
        { id: exam.sections[0].id, title: 'Phần I', instructions: rich(''), items: items(0, 6) },
        { title: 'Phần II', instructions: rich(''), items: items(6, 12) },
        { title: 'Phần III', instructions: rich(''), items: items(12, 15) },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return exam.id as string;
}

const runId = (testInfo: { retry: number; repeatEachIndex: number }) =>
  `${testInfo.repeatEachIndex}-${testInfo.retry}`;

/** Khoảng cách từ đỉnh khung nhìn tới ô "Tiêu đề Phần" thứ n (0 là Phần đầu). */
const titleTop = async (page: Page, n: number) =>
  (await page.getByRole('textbox', { name: 'Tiêu đề Phần' }).nth(n).boundingBox())?.y ?? -9999;

test('chuyển nhanh giữa các Phần: nút trước/sau, danh sách Phần, nhãn đổi theo vị trí cuộn', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await page.emulateMedia({ reducedMotion: 'reduce' }); // cuộn tức thì, bài kiểm không phải chờ hoạt ảnh
  await signIn(page, `e2e-nav-${p}`);
  const examId = await seedExam(page, `${p}-n-${runId(testInfo)}`);
  await page.goto(`/examiner/exams/${examId}`);

  const nav = page.getByRole('group', { name: 'Chuyển nhanh giữa các Phần' });
  await expect(nav).toBeVisible();
  const prev = nav.getByRole('button', { name: 'Phần trước' });
  const next = nav.getByRole('button', { name: 'Phần sau' });
  const list = nav.getByRole('button', { name: /mở danh sách Phần/ });
  await expect(list).toHaveText('Phần 1/3');
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();

  // Sang Phần 2: đầu Phần hiện ra trong khung nhìn, không bị thanh đầu trang che.
  await next.click();
  await expect(list).toHaveText('Phần 2/3');
  await expect.poll(() => titleTop(page, 1)).toBeGreaterThan(60);
  await expect.poll(() => titleTop(page, 1)).toBeLessThan(400);

  await next.click();
  await expect(list).toHaveText('Phần 3/3');
  await expect(next).toBeDisabled();
  await expect(prev).toBeEnabled();

  // Danh sách: tên Phần, số câu; chọn Phần I thì nhảy về đầu.
  await list.click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: /Phần II.*6 câu/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Phần III.*3 câu/ })).toBeVisible();
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/chuyen-phan-danh-sach-${p}.png` });
  await menu.getByRole('menuitem', { name: /Phần I\b.*6 câu/ }).click();
  await expect(list).toHaveText('Phần 1/3');
  await expect.poll(() => titleTop(page, 0)).toBeGreaterThan(60);

  // Tự cuộn xuống đáy trang thì nhãn theo kịp (Phần cuối ngắn vẫn được tính là đang xem).
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(list).toHaveText('Phần 3/3');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    'tràn ngang',
  ).toBe(0);
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/chuyen-phan-${p}.png` });
});

test('bộ đề một Phần không có bộ chuyển Phần', async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-nav1-${p}`);
  const created = await page.request.post('/api/exams', {
    headers,
    data: { title: `Đề một Phần ${p}-${runId(testInfo)}` },
  });
  const exam = await created.json();
  await page.goto(`/examiner/exams/${exam.id}`);
  await expect(page.getByRole('button', { name: 'Thêm câu hỏi' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Chuyển nhanh giữa các Phần' })).toHaveCount(0);
});

test('hộp Phát hành cho biết từng Phần có bao nhiêu câu, rút bao nhiêu, và tổng mỗi người nhận', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-pub-${p}`);
  const examId = await seedExam(page, `${p}-p-${runId(testInfo)}`);
  await page.goto(`/examiner/exams/${examId}`);
  // Phần I rút 50 % (6 câu → 3), hai Phần còn lại lấy đủ.
  await page
    .getByRole('textbox', { name: /^Tỷ lệ rút của Phần/ })
    .nth(0)
    .fill('50');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Bộ đề').last()).toBeVisible();
  await page.getByRole('button', { name: 'Phát hành' }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Phát hành Bộ đề' });
  const table = dialog.getByTestId('publish-draw');
  await expect(table).toBeVisible();
  // Tên Phần đứng đầu dòng; "Phần II" không được khớp "Phần III".
  const row = (name: string) =>
    table.getByRole('listitem').filter({ hasText: new RegExp(`^${name}(?!I)`) });
  await expect(row('Phần I')).toContainText('3/6 câu');
  await expect(row('Phần I')).toContainText('rút 50 %');
  await expect(row('Phần II')).toContainText('6/6 câu');
  await expect(row('Phần II')).toContainText('lấy đủ');
  await expect(row('Phần III')).toContainText('3/3 câu');
  const total = dialog.getByTestId('publish-draw-total');
  await expect(total).toContainText('15 câu');
  await expect(total).toContainText('mỗi Người dự thi nhận 12 câu');
  await expect(total).toContainText('tối đa 12 điểm');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/phat-hanh-${p}.png` });
});
