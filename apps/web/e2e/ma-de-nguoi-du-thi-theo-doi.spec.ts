import { expect, type Page, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';

// V4b (docs/plan/ma-de-phien-thi-thiet-ke.md mục 4.5, Q471, Q474): Người dự thi thấy "Mã đề của bạn" ở màn xác nhận và đầu màn làm
// bài; Theo dõi có cột Mã đề và lọc theo Mã đề. Chạy trên cả desktop và mobile.

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
  await page.screenshot({ path: `${process.env.SHOTS}/ma-de-${name}.png` });
};

const uniqueCode = (p: string) =>
  `MV${p[0]?.toUpperCase()}${Date.now().toString(36)}`.toUpperCase().slice(0, 12);

/**
 * Bộ đề 8 câu đã Phát hành và một Phiên thi đang mở với 4 Người dự thi trong Danh sách (cùng Lớp): dùng chung `variantCount` Mã đề,
 * hoặc mỗi người một đề. Dựng bằng API của Người ra đề.
 */
async function seedSession(
  page: Page,
  p: string,
  tag: string,
  options: { shared: boolean; variantCount?: number },
) {
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `Chủ đề ${tag}` });
  const ids: string[] = [];
  for (let n = 1; n <= 8; n++) {
    const q = await post('/api/questions', {
      type: 'single_choice',
      topicId: topic.id,
      stem: rich(`Câu hỏi số ${n}`),
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
    ids.push(q.id);
  }
  const exam = await post('/api/exams', { title: tag });
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: tag,
      instructions: rich(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: 'Phần I',
          instructions: rich(''),
          items: ids.map((questionId) => ({ questionId, points: 1 })),
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await post(`/api/exams/${exam.id}/publish`, { version: (await saved.json()).version });
  const now = Date.now();
  const code = uniqueCode(p);
  const session = await post('/api/sessions', {
    examId: exam.id,
    title: `Ca ${tag}`,
    opensAt: new Date(now - 10 * 60_000).toISOString(),
    closesAt: new Date(now + 4 * 3_600_000).toISOString(),
    durationMinutes: 30,
    accessCode: code,
    ...(options.shared
      ? { drawScope: 'shared', variantCount: options.variantCount ?? 1 }
      : { drawScope: 'per_candidate' }),
  });
  await post(`/api/sessions/${session.id}/roster`, {
    classLabel: `LOP-MDW-${p === 'desktop' ? 'D' : 'M'}`,
  });
  return { id: session.id as string, code };
}

/** Người dự thi `n` (1 đến 4) vào Phiên thi bằng Mã vào thi (API) và trả về Mã đề do máy chủ báo cho họ. */
async function joinAs(page: Page, p: string, n: number, sessionId: string, code: string) {
  await signIn(page, `e2e-mdw-sv${n}-${p}`);
  const join = await page.request.post('/api/take/join', { headers, data: { code } });
  expect(join.ok(), await join.text()).toBe(true);
  const list = await (await page.request.get('/api/take/sessions')).json();
  const item = (
    list.items as { sessionId: string; variant: { number: number; label: string } | null }[]
  ).find((i) => i.sessionId === sessionId);
  return item?.variant ?? null;
}

test('Người dự thi thấy "Mã đề của bạn" ở màn xác nhận và đầu màn làm bài (2 Mã đề)', async ({
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = `${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  const owner = await browser.newPage({ baseURL: ORIGIN });
  await signIn(owner, `e2e-mdw-${p}`);
  const { id, code } = await seedSession(owner, p, `Mã đề người dự thi ${tag}`, {
    shared: true,
    variantCount: 2,
  });
  await owner.context().close();

  // Cả 4 người: mỗi người thấy đúng Mã đề máy chủ đã gán; hai Mã đề đều có người (chia cân bằng 2/2).
  const seen: number[] = [];
  for (const n of [1, 2, 3, 4]) {
    const context = await browser.newContext({ baseURL: ORIGIN });
    const page = await context.newPage();
    const variant = await joinAs(page, p, n, id, code);
    expect(variant, `sinh viên ${n}`).not.toBeNull();
    seen.push((variant as { number: number }).number);
    if (n <= 2) {
      // Màn xác nhận, rồi đầu màn làm bài.
      await page.goto(`/take/sessions/${id}`);
      await expect(page.getByTestId('my-variant')).toHaveText((variant as { label: string }).label);
      await expect(page.getByText('Mã đề của bạn', { exact: true })).toBeVisible();
      await shot(page, `xac-nhan-${p}-${n}`);
      await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
      const banner = page.getByTestId('attempt-variant');
      await expect(banner).toContainText(`Mã đề của bạn: ${(variant as { label: string }).label}`);
      await expect(banner).toContainText('Bài gồm 8 câu');
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await shot(page, `lam-bai-${p}-${n}`);
    }
    await context.close();
  }
  expect(new Set(seen)).toEqual(new Set([1, 2]));
});

test('Phiên thi một Mã đề hay mỗi người một đề: không có dòng "Mã đề của bạn"', async ({
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = `${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  const owner = await browser.newPage({ baseURL: ORIGIN });
  await signIn(owner, `e2e-mdw-${p}`);
  const one = await seedSession(owner, p, `Dự thi một Mã đề ${tag}`, {
    shared: true,
    variantCount: 1,
  });
  const per = await seedSession(owner, p, `Dự thi mỗi người ${tag}`, { shared: false });
  await owner.context().close();

  for (const [index, session] of [one, per].entries()) {
    const context = await browser.newContext({ baseURL: ORIGIN });
    const page = await context.newPage();
    expect(await joinAs(page, p, index + 1, session.id, session.code)).toBeNull();
    await page.goto(`/take/sessions/${session.id}`);
    await expect(page.getByRole('button', { name: 'Bắt đầu làm bài' })).toBeVisible();
    await expect(page.getByTestId('my-variant')).toHaveCount(0);
    await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
    await expect(page).toHaveURL(/\/take\/attempts\//);
    await expect(page.getByTestId('attempt-variant')).toHaveCount(0);
    await context.close();
  }
});

test('Theo dõi: cột Mã đề và lọc theo Mã đề', async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  const tag = `${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  await signIn(page, `e2e-mdw-${p}`);
  const { id } = await seedSession(page, p, `Theo dõi Mã đề ${tag}`, {
    shared: true,
    variantCount: 2,
  });
  const monitor = await (await page.request.get(`/api/sessions/${id}/monitor`)).json();
  const counts = Object.fromEntries(
    (monitor.variants as { number: number; count: number }[]).map((v) => [v.number, v.count]),
  );
  expect((counts[1] ?? 0) + (counts[2] ?? 0)).toBe(4);
  const inFirst = counts[1] ?? 0;

  await page.goto(`/examiner/sessions/${id}?tab=monitor`);
  // Thẻ (mặc định khi ít người): dòng định danh có Mã đề. Bảng: có cột Mã đề.
  await expect(page.getByText('4 / 4 người')).toBeVisible();
  await page.getByRole('button', { name: 'Bảng' }).click();
  // Điện thoại hiện dạng thẻ: Mã đề nằm cuối dòng định danh; máy tính có cột Mã đề.
  const variantTexts = async () =>
    p === 'mobile'
      ? (await page.getByText(/ · Đề \d$/).allInnerTexts()).map((text) => text.slice(-4))
      : await page.getByTestId('monitor-variant').allInnerTexts();
  if (p !== 'mobile') {
    await expect(page.getByRole('columnheader', { name: 'Mã đề' })).toBeVisible();
  }
  expect(await variantTexts()).toHaveLength(4);
  await shot(page, `theo-doi-${p}`);

  // Lọc: chọn Đề 1 thì chỉ còn người của Đề 1; "Bỏ lọc" trả về đủ.
  const filter = async (label: string) => {
    if (p === 'mobile') {
      await page.getByRole('button', { name: 'Bộ lọc' }).click();
      const sheet = page.getByRole('dialog', { name: 'Bộ lọc' });
      await sheet.getByLabel('Mã đề', { exact: true }).selectOption({ label });
      await sheet.getByRole('button', { name: 'Xong' }).click();
    } else {
      await page.getByLabel('Mã đề', { exact: true }).selectOption({ label });
    }
  };
  await filter('Đề 1');
  await expect(page.getByText(`${inFirst} / 4 người`)).toBeVisible();
  const shown = await variantTexts();
  expect(shown).toHaveLength(inFirst);
  for (const text of shown) expect(text).toBe('Đề 1');
  await shot(page, `theo-doi-loc-${p}`);
  await page.getByRole('button', { name: 'Bỏ lọc' }).click();
  await expect(page.getByText('4 / 4 người')).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
