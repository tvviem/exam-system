import { expect, type Page, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';

// Trang Bộ đề đã phát hành: thẻ tổng quan đầu trang, chuyển nhanh giữa các Phần (thanh dính) và lọc câu hỏi theo nội dung hoặc tag.
// Bản nháp giữ nguyên. Chạy trên cả desktop và mobile.

const headers = { origin: ORIGIN };
const rich = (text: string) => ({
  type: 'doc',
  content: [
    text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
  ],
});

/** Chụp ảnh để xem bằng mắt khi đặt SHOTS=<thư mục> (không chụp trong CI). */
const shot = async (page: Page, name: string) => {
  if (!process.env.SHOTS) return;
  await page.screenshot({ path: `${process.env.SHOTS}/bo-de-${name}.png` });
};

/**
 * Bộ đề ba Phần, mỗi câu 1 điểm: Phần I 6 câu "Tính tích phân hàm số n" (tag "giải tích"), rút 50 % (3 câu); Phần II 4 câu "Cấu trúc
 * dữ liệu n" (tag "tin học"); Phần III 2 câu "Giới hạn dãy số n" (tag "giải tích" và "chương 4"). Cả Bộ đề 12 câu, 12 điểm; mỗi người
 * nhận 9 câu, 9 điểm (75 %). Phát hành nếu `publish`.
 */
async function seed(page: Page, tag: string, publish: boolean) {
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `Tổng quan ${tag}` });
  const make = async (stem: string, tags: string[]) => {
    const q = await post('/api/questions', {
      type: 'single_choice',
      topicId: topic.id,
      stem: rich(stem),
      defaultPoints: 1,
      tags,
      payload: {
        options: [
          { id: 'o1', content: rich('a') },
          { id: 'o2', content: rich('b') },
        ],
        key: ['o1'],
        shuffleOptions: false,
      },
    });
    return { questionId: q.id as string, points: 1 };
  };
  const group = async (stem: string, n: number, tags: string[]) =>
    Promise.all(Array.from({ length: n }, (_, i) => make(`${stem} ${i + 1}`, tags)));
  const one = await group('Tính tích phân hàm số', 6, ['giải tích']);
  const two = await group('Cấu trúc dữ liệu', 4, ['tin học']);
  const three = await group('Giới hạn dãy số', 2, ['giải tích', 'chương 4']);
  const exam = await post('/api/exams', { title: `Tổng quan ${tag}` });
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: `Tổng quan ${tag}`,
      instructions: rich(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: 'Phần I',
          instructions: rich(''),
          drawPercent: 50,
          items: one,
        },
        { title: 'Phần II', instructions: rich(''), items: two },
        { title: 'Phần III', instructions: rich(''), items: three },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  if (publish)
    await post(`/api/exams/${exam.id}/publish`, { version: (await saved.json()).version });
  return exam.id as string;
}

const sectionCard = (page: Page, index: number) =>
  page.locator('[id^="section-"][tabindex="-1"]').nth(index);
const status = (page: Page) => page.getByTestId('filter-status');
const query = (page: Page) => page.getByLabel('Tìm theo nội dung hoặc tag');

test('Thẻ tổng quan, bảng Phần và chuyển nhanh giữa các Phần ở Bộ đề đã phát hành; bản nháp giữ nguyên', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-pov-${p}`);
  const tag = `${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  const published = await seed(page, `a-${tag}`, true);
  await page.goto(`/examiner/exams/${published}`);

  // Ô số lớn: tổng câu, tổng điểm, mỗi người nhận (nổi bật), tỷ lệ rút chung, số Phần.
  await expect(page.getByTestId('exam-overview')).toBeVisible();
  await expect(page.getByTestId('overview-items')).toContainText('12');
  await expect(page.getByTestId('overview-points')).toContainText('12');
  await expect(page.getByTestId('draw-summary')).toContainText('9 câu');
  await expect(page.getByTestId('draw-summary')).toContainText('tối đa 9 điểm');
  await expect(page.getByTestId('overview-ratio')).toContainText('75 %');
  await expect(page.getByTestId('overview-sections')).toContainText('3');

  // Bảng Phần: tên, số câu có, tỷ lệ rút, số câu nhận, điểm.
  const rows = page.getByTestId('overview-section');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Phần I');
  // Các cột (máy tính) hay dòng tóm tắt (điện thoại) đều có đủ số liệu.
  await expect(rows.nth(0).locator('span.tabular-nums')).toHaveText(['6', '50 %', '3', '3']);
  await expect(rows.nth(2).locator('span.tabular-nums')).toHaveText(['2', '100 %', '2', '2']);
  if (p === 'mobile') {
    await expect(rows.nth(0)).toContainText('6 câu · rút 50 % → nhận 3 câu · 3 điểm');
    await expect(rows.nth(1)).toContainText('4 câu · rút 100 % → nhận 4 câu · 4 điểm');
  } else {
    await expect(rows.nth(0).getByText('50 %', { exact: true })).toBeVisible();
  }
  await shot(page, `tong-quan-${p}`);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Bấm một Phần trong bảng thì nhảy tới Phần đó; thanh dính nói "Phần 3/3" và có ‹ ›.
  const nav = page.getByRole('group', { name: 'Chuyển nhanh giữa các Phần' });
  await expect(nav).toBeVisible();
  await expect(nav).toContainText('Phần 1/3');
  await rows.nth(2).click();
  await expect(sectionCard(page, 2)).toBeInViewport();
  await expect(nav).toContainText('Phần 3/3');
  await expect(rows.nth(2)).toHaveAttribute('aria-current', 'location');
  await nav.getByRole('button', { name: 'Phần trước' }).click();
  await expect(nav).toContainText('Phần 2/3');
  await expect(sectionCard(page, 1)).toBeInViewport();
  await shot(page, `thanh-dinh-${p}`);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Bản nháp: không có thẻ tổng quan, bộ lọc hay thanh xem mới.
  const draft = await seed(page, `b-${tag}`, false);
  await page.goto(`/examiner/exams/${draft}`);
  await expect(page.getByLabel('Tên Bộ đề')).toBeVisible();
  await expect(page.getByTestId('exam-overview')).toHaveCount(0);
  await expect(page.getByTestId('exam-filter')).toHaveCount(0);
  await expect(page.getByTestId('view-count')).toHaveCount(0);
});

test('Lọc câu hỏi theo nội dung và theo tag; Xóa lọc; nút "Lọc" ở thanh dính đưa con trỏ vào ô tìm', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-pov-${p}`);
  const published = await seed(page, `c-${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`, true);
  await page.goto(`/examiner/exams/${published}`);
  await expect(page.getByTestId('exam-filter')).toBeVisible();
  await expect(page.getByText('Tính tích phân hàm số 1', { exact: true })).toBeVisible();

  // Theo nội dung, không phân biệt hoa thường và dấu: "CAU TRUC" khớp "Cấu trúc dữ liệu".
  await query(page).fill('CAU TRUC');
  await expect(status(page)).toHaveText('Hiện 4/12 câu');
  await expect(page.getByTestId('view-count')).toHaveText('Hiện 4/12 câu');
  await expect(page.getByText('Cấu trúc dữ liệu 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Tính tích phân hàm số 1', { exact: true })).toHaveCount(0);
  // Số câu giữ nguyên: Phần II bắt đầu ở Câu 4 (Phần I rút ra 3 câu nhưng vẫn có 6 câu trong Bộ đề → Câu 7).
  await expect(page.getByText('Câu 7', { exact: true })).toBeVisible();
  await expect(page.getByText('Câu 1', { exact: true })).toHaveCount(0);
  // Hai Phần không còn câu nào khớp ghi rõ.
  await expect(page.getByTestId('filter-empty')).toHaveCount(2);
  await expect(page.getByTestId('filter-empty').first()).toHaveText('Không có câu khớp');
  await shot(page, `loc-noi-dung-${p}`);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Theo tag: chọn "chương 4" chỉ còn Phần III (2 câu); kết hợp với nội dung.
  await query(page).fill('');
  await page.getByLabel('Tag', { exact: true }).selectOption('chương 4');
  await expect(status(page)).toHaveText('Hiện 2/12 câu');
  await expect(page.getByText('Giới hạn dãy số 1', { exact: true })).toBeVisible();
  await expect(page.getByTestId('filter-empty')).toHaveCount(2);
  await query(page).fill('gioi han day so 2');
  await expect(status(page)).toHaveText('Hiện 1/12 câu');
  // Nội dung không khớp tag đã chọn thì không còn câu nào.
  await query(page).fill('cau truc');
  await expect(status(page)).toHaveText('Hiện 0/12 câu');
  await expect(page.getByTestId('filter-empty')).toHaveCount(3);

  // Tìm theo tag bằng ô từ khóa (không chọn tag): "tin hoc" khớp tag "tin học".
  await page.getByLabel('Tag', { exact: true }).selectOption('');
  await query(page).fill('tin hoc');
  await expect(status(page)).toHaveText('Hiện 4/12 câu');

  // Xóa lọc: đủ mọi câu, hết thông báo.
  await page.getByRole('button', { name: 'Xóa lọc' }).click();
  await expect(query(page)).toHaveValue('');
  await expect(page.getByLabel('Tag', { exact: true })).toHaveValue('');
  await expect(status(page)).toHaveText('');
  await expect(page.getByTestId('filter-empty')).toHaveCount(0);
  await expect(page.getByText('Tính tích phân hàm số 1', { exact: true })).toBeVisible();
  await expect(page.getByTestId('view-count')).toContainText('12 câu');

  // Nút "Lọc" ở thanh dính: từ cuối trang cuộn lên ô lọc và đưa con trỏ vào ô tìm.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: 'Lọc', exact: true }).click();
  await expect(page.getByTestId('exam-filter')).toBeInViewport();
  await expect(query(page)).toBeFocused();
});
