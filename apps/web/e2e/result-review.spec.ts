import { expect, test } from '@playwright/test';
import { examinerPage, ORIGIN, seedOpenSession, signIn } from './take-support';

// Duyệt Kết quả từng câu của Người dự thi (Q318). Bộ đề của `seedOpenSession`: chọn một (1 điểm, đáp án o1), chọn nhiều (2, o1+o3),
// chùm (1, s1 đúng s2 sai), tự luận (5). Người dự thi chọn sai câu chọn một, bỏ trống câu chọn nhiều, đúng một Mệnh đề của chùm,
// viết tự luận được 5 điểm: đủ bốn kết quả. Người ra đề bật "Cho xem lại đề" nên nội dung câu hiện ra (không bao giờ có đáp án).

const headers = { origin: ORIGIN };

test('duyệt từng câu: bản đồ, bộ lọc, câu sai kế tiếp, giữ chỗ khi tải lại, không lộ đáp án', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const project = testInfo.project.name;
  const L = project === 'desktop' ? 'D' : 'M';
  const code = `RVW${L}${Date.now() % 100000}`;
  const examiner = await examinerPage(browser, `e2e-lb-rv-gv-${project}`);
  const sessionId = await seedOpenSession(examiner, `rv-${project}`, code, `RV-${L}-001`);

  const context = await browser.newContext({ baseURL: ORIGIN });
  const page = await context.newPage();
  await signIn(page, `e2e-lb-rv-sv-${project}`);
  expect((await page.request.post('/api/take/join', { headers, data: { code } })).ok()).toBe(true);
  const start = await (
    await page.request.post(`/api/take/sessions/${sessionId}/start`, { headers, data: {} })
  ).json();
  const view = await (await page.request.get(`/api/take/attempts/${start.attempt.id}`)).json();
  const itemId = (type: string) =>
    view.sections[0].items.find((i: { type: string }) => i.type === type).itemId;
  const saved = await page.request.put(`/api/take/attempts/${start.attempt.id}/responses`, {
    headers,
    data: {
      items: [
        { itemId: itemId('single_choice'), value: { optionId: 'o2' }, clientSeq: 1 },
        {
          itemId: itemId('true_false_cluster'),
          value: { answers: { s1: true, s2: true } },
          clientSeq: 1,
        },
        { itemId: itemId('essay'), value: { text: 'Bài làm của em về giới hạn' }, clientSeq: 1 },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await page.request.post(`/api/take/attempts/${start.attempt.id}/submit`, { headers, data: {} });

  // Người ra đề: bật xem lại đề, kết thúc, chấm tự luận 5/5, Công bố.
  const call = async (method: 'put' | 'post', url: string, data: unknown) => {
    const res = await examiner.request[method](`/api/sessions/${sessionId}${url}`, {
      headers,
      data,
    });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json().catch(() => null);
  };
  await call('put', '/grading/review', { reviewAfterRelease: true });
  await call('post', '/close-entry', {});
  const grading = await (
    await examiner.request.get(`/api/sessions/${sessionId}/grading/items`)
  ).json();
  await call('put', `/grading/attempts/${start.attempt.id}/items/${grading.items[0].itemId}`, {
    score: 5,
    feedback: 'Bài làm rất tốt',
  });
  await call('post', '/release', { appealPeriodDays: 3 });

  // Người dự thi mở Kết quả.
  await page.goto('/take');
  await page.getByRole('link', { name: 'Xem Kết quả' }).first().click();
  await expect(page.getByTestId('result-hero')).toBeVisible();
  // Nút lọc dùng nhãn ngắn ("Một phần"); dải kết quả đầu thẻ câu mới ghi "Chưa đúng hoàn toàn".
  const chip = (name: string, count: number) =>
    page.getByRole('button', {
      name: new RegExp(`^${name === 'Chưa đúng hoàn toàn' ? 'Một phần' : name}\\s*${count}$`),
    });
  await expect(chip('Đúng', 1)).toBeVisible();
  await expect(chip('Chưa đúng hoàn toàn', 1)).toBeVisible();
  await expect(chip('Sai', 1)).toBeVisible();
  await expect(chip('Bỏ trống', 1)).toBeVisible();

  // Chỉ một thẻ câu mỗi lần, không còn danh sách dài.
  await expect(page.getByTestId('result-item')).toHaveCount(1);

  // Chuyển câu không được nhảy về đầu trang: cuộn xuống một đoạn (tối đa 150 px, tùy trang dài bao nhiêu), bấm Câu sau,
  // vị trí cuộn vẫn giữ.
  const scrolled = await page.evaluate(() => {
    const y = Math.min(150, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, y);
    return y;
  });
  expect(scrolled).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Câu sau' }).filter({ visible: true }).click();
  await expect(page.getByTestId('result-item')).toContainText('Câu 2');
  await page.waitForTimeout(300); // đủ thời gian để một lần cuộn về đầu trang (nếu có) xảy ra
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled / 2);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Lọc "Sai": nhảy tới câu sai, thấy nội dung và lựa chọn của mình, không có đáp án đúng.
  const started = performance.now();
  await chip('Sai', 1).click();
  const item = page.getByTestId('result-item');
  await expect(item).toHaveAttribute('data-verdict', 'wrong');
  console.log(`[${project}] lọc Sai → thẻ câu đổi: ${(performance.now() - started).toFixed(0)} ms`);
  await expect(item.getByText(/Thủ đô của Việt Nam/)).toBeVisible();
  await expect(item.getByText('Hà Nội')).toBeVisible();
  await expect(item.locator('[data-chosen="true"]')).toHaveCount(1);
  await expect(item.locator('[data-chosen="true"]')).toContainText('Huế'); // chọn Huế (sai), Hà Nội không được đánh dấu
  await expect(item.getByText('Bạn đã chọn')).toHaveCount(1);
  await expect(page.getByText(/Đáp án/)).toHaveCount(0);

  // Bỏ lọc, duyệt tới câu bỏ trống và câu chùm một phần.
  await chip('Sai', 1).click();
  await chip('Bỏ trống', 1).click();
  await expect(item).toHaveAttribute('data-verdict', 'blank');
  await expect(item.getByText('Bạn không trả lời')).toBeVisible();
  await chip('Bỏ trống', 1).click(); // bỏ lọc
  await chip('Chưa đúng hoàn toàn', 1).click();
  await expect(item).toHaveAttribute('data-verdict', 'partial');
  await expect(item.getByText('đúng 1/2 Mệnh đề')).toBeVisible();
  await expect(item.getByText('Bạn chọn Đúng')).toHaveCount(2);
  await chip('Chưa đúng hoàn toàn', 1).click(); // bỏ lọc

  // "Câu sai kế tiếp" quay vòng tới đúng câu sai duy nhất (đang ở câu khác).
  await page.getByRole('button', { name: 'Câu sai kế tiếp' }).filter({ visible: true }).click();
  await expect(item).toHaveAttribute('data-verdict', 'wrong');
  const wrongUrl = new URL(page.url());
  expect(wrongUrl.searchParams.get('cau')).toMatch(/^\d+$/);

  // Tải lại trang: vẫn đúng câu (địa chỉ giữ số câu).
  await page.reload();
  await expect(page.getByTestId('result-item')).toHaveAttribute('data-verdict', 'wrong');

  // Bản đồ: máy tính có sẵn ở cột trái, điện thoại mở từ thanh dưới. Chọn câu tự luận (Đúng, 5/5).
  if (project === 'mobile') {
    await page.getByRole('button', { name: /Mở bản đồ câu/ }).click();
    await expect(page.getByRole('dialog', { name: 'Chọn câu' })).toBeVisible();
  }
  const cells = page.getByRole('button', { name: /^Câu \d+: Đúng$/ }).filter({ visible: true });
  await expect(cells).toHaveCount(1);
  await cells.click();
  await expect(item).toHaveAttribute('data-verdict', 'correct');
  await expect(item.getByText('Bài làm của em về giới hạn')).toBeVisible();
  await expect(item.getByText('Bài làm rất tốt')).toBeVisible();
  await expect(item.getByText(/5\/5 điểm/)).toBeVisible();

  // Phím mũi tên và nút trước/sau (không bấm chọn được phương án).
  const before = new URL(page.url()).searchParams.get('cau');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => new URL(page.url()).searchParams.get('cau')).not.toBe(before);
  await expect(page.locator('input[type="radio"], input[type="checkbox"]')).toHaveCount(0);
  await context.close();
});
