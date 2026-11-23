import { expect, type Page, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';

// V3b (docs/plan/ma-de-phien-thi-thiet-ke.md mục 4.4, Q479): Danh sách dự thi có cột Mã đề, số người từng Mã đề, đổi tay từng người và
// nút Chia lại; khóa khi đã có người làm bài. Chạy trên cả desktop và mobile.

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
  await page.getByTestId('roster-variants').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${process.env.SHOTS}/ma-de-${name}.png` });
};

const uniqueCode = (p: string) =>
  `MW${p[0]?.toUpperCase()}${Date.now().toString(36)}`.toUpperCase().slice(0, 12);

/**
 * Bộ đề 8 câu đã Phát hành và một Phiên thi đang mở có `variantCount` Mã đề (dùng chung) hoặc mỗi người một đề, kèm 4 Người dự thi
 * trong Danh sách. Dựng bằng API của Người ra đề.
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
  return { id: session.id as string, code, title: `Ca ${tag}` };
}

/** Số người của từng Mã đề đọc từ dòng tóm tắt: ví dụ "Đề 1: 2 người" → [2, 1, 1]. */
const loadsOf = async (page: Page) =>
  (await page.getByTestId('variant-load').allInnerTexts()).map((text) =>
    Number(/(\d+) người/.exec(text)?.[1]),
  );
const personSelect = (page: Page, n: number, p: string) =>
  page.getByLabel(`Mã đề của Sinh viên Chia ${n} ${p}`);

test('Danh sách dự thi: cột Mã đề, số người từng Mã đề; đổi tay thì số đếm đổi; Chia lại chia đều', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-mdw-${p}`);
  const { id } = await seedSession(
    page,
    p,
    `Chia lại ${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`,
    {
      shared: true,
      variantCount: 3,
    },
  );
  await page.goto(`/examiner/sessions/${id}?tab=roster`);

  // 4 người vào 3 Mã đề: chia đều (lệch tối đa 1), mỗi dòng có hộp chọn Mã đề.
  await expect(page.getByTestId('roster-variants')).toBeVisible();
  await expect(page.getByTestId('variant-load')).toHaveCount(3);
  const first = await loadsOf(page);
  expect(first.reduce((a, b) => a + b, 0)).toBe(4);
  expect(Math.max(...first) - Math.min(...first)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('variants-uneven')).toHaveCount(0);
  for (const n of [1, 2, 3, 4]) await expect(personSelect(page, n, p)).toBeEnabled();
  await shot(page, `danh-sach-${p}`);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Đổi tay một người sang Đề 1: số đếm của Đề 1 tăng khi người đó không thuộc Đề 1 sẵn.
  const target = personSelect(page, 1, p);
  const was = Number(await target.inputValue());
  if (was !== 1) {
    await target.selectOption({ label: 'Đề 1' });
    await expect(page.getByTestId('variant-load').first()).toContainText(
      `${(first[0] ?? 0) + 1} người`,
    );
    await expect(target).toHaveValue('1');
  }

  // Dồn cả 4 người về Đề 1: lệch nhiều → cảnh báo.
  for (const n of [1, 2, 3, 4]) {
    if ((await personSelect(page, n, p).inputValue()) !== '1') {
      await personSelect(page, n, p).selectOption({ label: 'Đề 1' });
    }
  }
  await expect(page.getByTestId('variant-load').first()).toContainText('4 người');
  await expect(page.getByTestId('variants-uneven')).toBeVisible();
  await shot(page, `lech-${p}`);

  // Chia lại: hộp xác nhận (Hủy không đổi gì), rồi chia đều.
  await page.getByRole('button', { name: 'Chia lại' }).click();
  const dialog = page.getByRole('dialog', { name: 'Chia lại Người dự thi vào các Mã đề?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Hủy' }).click();
  await expect(dialog).toBeHidden();
  expect(await loadsOf(page)).toEqual([4, 0, 0]);
  await page.getByRole('button', { name: 'Chia lại' }).click();
  await page
    .getByRole('dialog', { name: 'Chia lại Người dự thi vào các Mã đề?' })
    .getByRole('button', { name: 'Chia lại', exact: true })
    .click();
  await expect(page.getByText('Đã chia lại Người dự thi vào các Mã đề.')).toBeVisible();
  await expect(page.getByTestId('variants-uneven')).toHaveCount(0);
  const after = await loadsOf(page);
  expect(after.reduce((a, b) => a + b, 0)).toBe(4);
  expect(Math.max(...after) - Math.min(...after)).toBeLessThanOrEqual(1);
});

test('Phiên thi mỗi người một đề hay một Mã đề: không có cột Mã đề, không có nút Chia lại', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-mdw-${p}`);
  const tag = `${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  const per = await seedSession(page, p, `Mỗi người ${tag}`, { shared: false });
  await page.goto(`/examiner/sessions/${per.id}?tab=roster`);
  await expect(page.getByText(`Sinh viên Chia 1 ${p}`)).toBeVisible();
  await expect(page.getByTestId('roster-variants')).toHaveCount(0);
  await expect(page.getByLabel(/^Mã đề của /)).toHaveCount(0);

  const one = await seedSession(page, p, `Một Mã đề ${tag}`, { shared: true, variantCount: 1 });
  await page.goto(`/examiner/sessions/${one.id}?tab=roster`);
  await expect(page.getByText(`Sinh viên Chia 1 ${p}`)).toBeVisible();
  await expect(page.getByTestId('roster-variants')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Chia lại' })).toHaveCount(0);
});

test('Đã có người làm bài: Chia lại và hộp chọn của người đó bị khóa; người chưa làm vẫn đổi tay được', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-mdw-${p}`);
  const { id, code } = await seedSession(
    page,
    p,
    `Khóa chia ${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`,
    { shared: true, variantCount: 2 },
  );

  // Sinh viên 1 vào thi và bắt đầu làm bài (API) → đã có Lượt.
  const context = await browser.newContext({ baseURL: ORIGIN });
  const candidate = await context.newPage();
  await signIn(candidate, `e2e-mdw-sv1-${p}`);
  const join = await candidate.request.post('/api/take/join', { headers, data: { code } });
  expect(join.ok(), await join.text()).toBe(true);
  const start = await candidate.request.post(`/api/take/sessions/${id}/start`, {
    headers,
    data: {},
  });
  expect(start.ok(), await start.text()).toBe(true);
  await context.close();

  await page.goto(`/examiner/sessions/${id}?tab=roster`);
  await expect(page.getByTestId('roster-variants')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chia lại' })).toBeDisabled();
  await expect(page.getByTestId('rebalance-locked')).toBeVisible();
  await expect(personSelect(page, 1, p)).toBeDisabled();

  // Người chưa làm bài (sinh viên 2) vẫn đổi tay được.
  const other = personSelect(page, 2, p);
  await expect(other).toBeEnabled();
  const now = await other.inputValue();
  const next = now === '1' ? '2' : '1';
  await other.selectOption({ label: `Đề ${next}` });
  await expect(other).toHaveValue(next);
  await page.reload();
  await expect(personSelect(page, 2, p)).toHaveValue(next);
  // Đã khóa: không nhắc "Chia lại" dù số người có lệch.
  await expect(page.getByTestId('variants-uneven')).toHaveCount(0);
  await shot(page, `khoa-${p}`);
});
