import { expect, type Page, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';

// Rà UX sau bản 0.5.1 (docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md, U1): Ngân hàng câu hỏi không lặp thông tin ở mọi dòng, và ở
// 1280 px cột Phần dẫn đọc được, không phải cuộn ngang. Đo bằng kích thước thật.

const headers = { origin: ORIGIN };
const rich = (text: string) => ({
  type: 'doc',
  content: [
    text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
  ],
});

/** Chủ đề A có 4 câu (2 câu nằm trong một Bộ đề nháp), Chủ đề B có 2 câu. */
async function seed(page: Page, tag: string) {
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topicA = await post('/api/topics', { name: `Giải tích ${tag}` });
  const topicB = await post('/api/topics', { name: `Đại số ${tag}` });
  const make = async (topicId: string, stem: string) =>
    post('/api/questions', {
      type: 'single_choice',
      topicId,
      stem: rich(stem),
      defaultPoints: 1,
      tags: [],
      payload: {
        options: [
          { id: 'o1', content: rich('a') },
          { id: 'o2', content: rich('b') },
        ],
        key: ['o1'],
        shuffleOptions: false,
      },
    });
  const a = [];
  for (let n = 1; n <= 4; n++) {
    a.push(
      await make(
        topicA.id,
        `Tính tích phân hàm số bậc ${n} trên đoạn từ không đến một rồi nêu ý nghĩa hình học ${tag}`,
      ),
    );
  }
  await make(topicB.id, `Giải hệ phương trình tuyến tính hai ẩn ${tag}`);
  await make(topicB.id, `Tìm ma trận nghịch đảo của ma trận vuông cấp hai ${tag}`);
  const exam = await post('/api/exams', { title: `Đề rà bảng ${tag}` });
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: `Đề rà bảng ${tag}`,
      instructions: rich(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: null,
          instructions: rich(''),
          items: a.slice(0, 2).map((q) => ({ questionId: q.id, points: 1 })),
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return { topicA: topicA.id as string, topicNameA: `Giải tích ${tag}` };
}

const runId = (testInfo: { retry: number; repeatEachIndex: number }) =>
  `${testInfo.repeatEachIndex}-${testInfo.retry}`;

test('Ngân hàng câu hỏi: Chủ đề ở dòng phụ, chỉ câu chưa dùng có nhãn, không lặp "Trong 1 Bộ đề"', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-uxb-gv-${p}`);
  const { topicA, topicNameA } = await seed(page, `${p}-${runId(testInfo)}`);

  await page.goto('/examiner/questions');
  const visible = (text: string | RegExp) => page.getByText(text).filter({ visible: true });
  await expect(visible(/Tính tích phân hàm số bậc 1/).first()).toBeVisible();

  // Không còn nhãn "Trong N Bộ đề" ở bất kỳ dòng nào
  await expect(visible(/^Trong \d+ Bộ đề$/)).toHaveCount(0);
  // Đang xem mọi Chủ đề: tên Chủ đề ở dòng phụ của từng câu
  await expect(visible(topicNameA)).not.toHaveCount(0);
  // Chỉ 4 câu chưa vào Bộ đề nào có nhãn "Chưa dùng" (2 câu của Chủ đề A đã vào Bộ đề thì không có)
  await expect(visible('Chưa dùng')).toHaveCount(4);

  // Chọn Chủ đề A (trên máy tính qua thanh bên, trên điện thoại qua danh sách chọn): tên Chủ đề không lặp ở từng dòng
  await page.goto(`/examiner/questions?topicId=${topicA}`);
  await expect(visible(/Tính tích phân hàm số bậc 1/).first()).toBeVisible();
  // Trên máy tính tên Chủ đề còn ở thanh bên (một lần); không lặp ở bốn dòng câu hỏi
  const topicMentions = await visible(topicNameA).count();
  expect(topicMentions, 'tên Chủ đề chỉ còn ở bộ chọn, không lặp ở từng dòng').toBeLessThanOrEqual(
    2,
  );
  await expect(visible('Chưa dùng')).toHaveCount(2); // 2 câu còn lại của Chủ đề A
  expect(await overflow(page), 'tràn ngang').toBe(0);
  if (process.env.SHOTS)
    await page.screenshot({
      path: `${process.env.SHOTS}/ngan-hang-chu-de-${p}.png`,
      fullPage: true,
    });
});

test('Ngân hàng câu hỏi (máy tính 1280 px): cột Phần dẫn đủ rộng, bảng không cuộn ngang, không còn cột Chủ đề và Dùng ở', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'bảng chỉ có từ 768 px');
  const p = testInfo.project.name;
  await signIn(page, `e2e-uxb-gv-${p}`);
  await seed(page, `${p}-w-${runId(testInfo)}`);
  await page.goto('/examiner/questions');
  await expect(page.getByRole('table')).toBeVisible();

  const headers = await page.getByRole('columnheader').allTextContents();
  expect(headers.map((h) => h.trim())).toEqual(['', 'Phần dẫn', 'Loại câu hỏi', 'Điểm']);

  // Cột Phần dẫn đọc được: rộng ít nhất 280 px, và đủ để một câu dài chỉ chiếm 2 đến 3 dòng chữ
  const stem = page.getByRole('columnheader', { name: 'Phần dẫn' });
  expect((await stem.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(280);
  // Vùng chứa bảng không cuộn ngang
  const scroll = await page.getByRole('table').evaluate((table) => {
    const box = table.parentElement as HTMLElement;
    return box.scrollWidth - box.clientWidth;
  });
  expect(scroll, 'bảng cuộn ngang').toBe(0);
  // Ngày cập nhật vẫn có (ở dòng phụ khi chưa có cột riêng)
  await expect(
    page
      .getByText(/^Cập nhật \d/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/ngan-hang-bang-${p}.png`, fullPage: true });
});
