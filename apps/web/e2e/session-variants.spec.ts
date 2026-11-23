import { expect, type Page, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';

// V2b (docs/plan/ma-de-phien-thi-thiet-ke.md mục 4.4, Q463, Q478, Q479): Cách ra đề ở form Phiên thi, tab Đề (xem câu, Rút lại, Xem
// thử, Xuất Word theo Mã đề). Chạy trên cả desktop và mobile.

const headers = { origin: ORIGIN };

/** Chụp ảnh để xem bằng mắt khi đặt SHOTS=<thư mục> (không chụp trong CI). */
const shot = async (page: Page, name: string, focus?: string) => {
  if (!process.env.SHOTS) return;
  if (focus) {
    await page
      .getByTestId(focus)
      .first()
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  }
  await page.screenshot({ path: `${process.env.SHOTS}/ma-de-${name}.png` });
};
const rich = (text: string) => ({
  type: 'doc',
  content: [
    text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
  ],
});

/** Bộ đề đã Phát hành: một Phần 30 câu × 1 điểm, mặc định rút 50 % (15 câu). Trả tên Bộ đề hiện ở danh sách chọn. */
async function seedExam(page: Page, title: string) {
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `Chủ đề ${title}` });
  const ids: string[] = [];
  for (let n = 1; n <= 30; n++) {
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
        shuffleOptions: true,
      },
    });
    ids.push(q.id);
  }
  const exam = await post('/api/exams', { title });
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title,
      instructions: rich(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: 'Phần I',
          instructions: rich(''),
          drawPercent: 50,
          items: ids.map((questionId) => ({ questionId, points: 1 })),
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await post(`/api/exams/${exam.id}/publish`, { version: (await saved.json()).version });
  return `${title} (30 câu, 30 điểm)`;
}

/** Tạo Phiên thi qua form 3 bước với số Mã đề đã cho; dừng ở trang chi tiết Phiên thi mới tạo. */
async function createSession(
  page: Page,
  examOption: string,
  name: string,
  variantCount: string,
  accessCode: string,
) {
  await page.goto('/examiner/sessions/new');
  await page.getByLabel('Bộ đề', { exact: true }).selectOption({ label: examOption });
  await page.getByLabel('Tên Phiên thi').fill(name);
  await page.getByRole('button', { name: 'Tiếp' }).click();
  await page.getByLabel('Giờ mở').fill('2030-01-10T08:00');
  await page.getByLabel('Giờ đóng').fill('2030-01-10T10:00');
  await page.getByRole('button', { name: 'Tiếp' }).click();
  await expect(page.getByText('Bước 3/3: Thiết lập làm bài')).toBeVisible();
  if (variantCount !== '1') await page.getByLabel('Số Mã đề').fill(variantCount);
  await page.getByLabel('Mã vào thi', { exact: true }).fill(accessCode);
  await page.getByRole('button', { name: 'Tạo Phiên thi' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/** Mã vào thi khác nhau cho mỗi lần chạy (các dự án chạy song song, và thử lại không được trùng Khung giờ + mã). */
const uniqueCode = (p: string) =>
  `MD${p[0]?.toUpperCase()}${Date.now().toString(36)}`.toUpperCase().slice(0, 12);

const itemTexts = (page: Page) => page.getByTestId('variant-item').allInnerTexts();
const openVariantsTab = async (page: Page) => {
  await page.getByRole('tab', { name: 'Đề', exact: true }).click();
  await expect(page.getByTestId('variants-tab')).toBeVisible();
};

test('Cách ra đề: mặc định dùng chung 1 Mã đề; tạo 3 Mã đề; tab Đề cho xem câu từng Mã đề', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-mdv-${p}`);
  const title = `Bộ đề Mã đề ${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  const option = await seedExam(page, title);

  await page.goto('/examiner/sessions/new');
  await page.getByLabel('Bộ đề', { exact: true }).selectOption({ label: option });
  await page.getByLabel('Tên Phiên thi').fill(`Ca Mã đề ${p}`);
  await page.getByRole('button', { name: 'Tiếp' }).click();
  await page.getByLabel('Giờ mở').fill('2030-01-10T08:00');
  await page.getByLabel('Giờ đóng').fill('2030-01-10T10:00');
  await page.getByRole('button', { name: 'Tiếp' }).click();

  // Mặc định: dùng chung, một Mã đề; Mã vào thi vẫn là ô riêng, khác Mã đề.
  const block = page.getByTestId('session-variants');
  await expect(block).toBeVisible();
  await expect(block.getByRole('radio', { name: /Dùng chung các Mã đề/ })).toBeChecked();
  await expect(page.getByLabel('Số Mã đề')).toHaveValue('1');
  await expect(block.getByText(/Họ vẫn chỉ nhập Mã vào thi như trước/)).toBeVisible();
  await expect(page.getByLabel('Mã vào thi', { exact: true })).toBeVisible();

  // Số sai: báo cạnh ô và khóa nút Tạo.
  for (const bad of ['0', '11', '']) {
    await page.getByLabel('Số Mã đề').fill(bad);
    await expect(page.getByText('Nhập số nguyên từ 1 đến 10.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạo Phiên thi' })).toBeDisabled();
  }
  // Mỗi người một đề: ô Số Mã đề biến mất, nút Tạo dùng lại được.
  await block.getByRole('radio', { name: /Mỗi người một đề/ }).check();
  await expect(page.getByLabel('Số Mã đề')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tạo Phiên thi' })).toBeEnabled();
  await block.getByRole('radio', { name: /Dùng chung các Mã đề/ }).check();
  await page.getByLabel('Số Mã đề').fill('3');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await shot(page, `form-${p}`, 'session-variants');

  await page.getByRole('button', { name: 'Tạo Phiên thi' }).click();
  await expect(page.getByRole('heading', { name: `Ca Mã đề ${p}`, level: 1 })).toBeVisible();
  await expect(page.getByTestId('overview-scope')).toHaveText('Dùng chung, 3 Mã đề');

  // Tab Đề: ba Mã đề, mỗi Mã đề 15 câu (50 % của 30).
  await openVariantsTab(page);
  const radios = page.getByRole('group', { name: 'Chọn Mã đề' }).getByRole('radio');
  await expect(radios).toHaveCount(3);
  await expect(page.getByTestId('variant-summary')).toHaveText('15 câu, tổng 15 điểm');
  await expect(page.getByTestId('variant-item')).toHaveCount(15);
  const first = await itemTexts(page);
  await page.getByRole('group', { name: 'Chọn Mã đề' }).getByText('Đề 2', { exact: true }).click();
  await expect(radios.nth(1)).toBeChecked();
  await expect(page.getByTestId('variant-item')).toHaveCount(15);
  expect(await itemTexts(page), 'hai Mã đề rút khác nhau').not.toEqual(first);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await shot(page, `tab-de-${p}`);
});

test('Một Mã đề: tab Đề không có hộp chọn Mã đề; Rút lại đổi bộ câu và hỏi xác nhận', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-mdv-${p}`);
  const title = `Bộ đề Rút lại ${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  await createSession(page, await seedExam(page, title), `Ca rút lại ${p}`, '1', uniqueCode(p));
  await expect(page.getByTestId('overview-scope')).toContainText('Dùng chung, 1 Mã đề');

  await openVariantsTab(page);
  await expect(page.getByRole('group', { name: 'Chọn Mã đề' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rút lại tất cả Mã đề' })).toHaveCount(0);
  const before = await itemTexts(page);
  expect(before).toHaveLength(15);

  // Hủy ở hộp xác nhận thì không đổi gì.
  await page.getByRole('button', { name: 'Rút lại Mã đề này' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rút lại Đề 1?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Hủy' }).click();
  await expect(dialog).toBeHidden();
  expect(await itemTexts(page)).toEqual(before);

  await page.getByRole('button', { name: 'Rút lại Mã đề này' }).click();
  await page
    .getByRole('dialog', { name: 'Rút lại Đề 1?' })
    .getByRole('button', { name: 'Rút lại', exact: true })
    .click();
  await expect(page.getByText('Đã rút lại bộ câu.')).toBeVisible();
  await expect.poll(async () => (await itemTexts(page)).join('|')).not.toBe(before.join('|'));
  await expect(page.getByTestId('variant-item')).toHaveCount(15);
});

test('Xem thử theo Mã đề và Xuất Word theo Mã đề', async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-mdv-${p}`);
  const title = `Bộ đề Xem thử ${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  await createSession(page, await seedExam(page, title), `Ca xem thử ${p}`, '3', uniqueCode(p));

  // Xem thử đúng Mã đề được chọn.
  await openVariantsTab(page);
  await page.getByRole('group', { name: 'Chọn Mã đề' }).getByText('Đề 2', { exact: true }).click();
  await page.getByRole('link', { name: 'Xem thử Mã đề này' }).click();
  await expect(page).toHaveURL(/variant=2/);
  await expect(page.getByTestId('preview-variant')).toContainText('Đang xem Đề 2');
  await expect(page.getByTestId('preview-variant')).toContainText('15 câu trong 30 câu');
  await page.goBack();

  // Xuất Word: Phiên thi nhiều Mã đề nên hộp thoại ở đầu trang hỏi Mã đề cần xuất.
  await page.getByRole('button', { name: 'Xuất Bộ đề' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Mã đề cần xuất')).toHaveValue('1');
  await dialog.getByLabel('Mã đề cần xuất').selectOption({ label: 'Đề 3' });
  await dialog.getByLabel('Học phần').fill('Tin học đại cương');
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Tải tệp Word' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^de-thi-.*\.docx$/);
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  await expect(page.getByText('Đã xuất tệp')).toBeVisible();

  // Từ tab Đề: nút xuất theo Mã đề đang chọn, không hỏi lại Mã đề.
  await page.getByRole('group', { name: 'Chọn Mã đề' }).getByText('Đề 3', { exact: true }).click();
  await page.getByRole('button', { name: 'Xuất Word Mã đề này' }).click();
  const second = page.getByRole('dialog');
  await expect(second.getByLabel('Mã đề cần xuất')).toHaveCount(0);
  await expect(second.getByText(/· Đề 3/)).toBeVisible();
});

test('Đã có người làm bài: tab Đề khóa Rút lại', async ({ page, browser }, testInfo) => {
  const p = testInfo.project.name;
  const code = uniqueCode(p);
  await signIn(page, `e2e-mdv-${p}`);
  const title = `Bộ đề Khóa ${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  await createSession(page, await seedExam(page, title), `Ca khóa ${p}`, '2', code);
  const sessionId = /sessions\/([0-9a-f-]{36})/.exec(page.url())?.[1] as string;
  // Đang mở: đổi giờ mở về quá khứ qua API để người dự thi vào được.
  const detail = await (await page.request.get(`/api/sessions/${sessionId}`)).json();
  const now = Date.now();
  const put = await page.request.put(`/api/sessions/${sessionId}`, {
    headers,
    data: {
      examId: detail.examId,
      title: detail.title,
      opensAt: new Date(now - 10 * 60_000).toISOString(),
      closesAt: new Date(now + 3_600_000).toISOString(),
      durationMinutes: detail.durationMinutes,
      hardClose: detail.hardClose,
      maxAttempts: detail.maxAttempts,
      attemptScoring: detail.attemptScoring,
      shuffleItems: detail.shuffleItems,
      shuffleOptions: detail.shuffleOptions,
      showScoringRules: detail.showScoringRules,
      reviewAfterRelease: detail.reviewAfterRelease,
      accessCode: detail.accessCode,
      version: detail.version,
    },
  });
  expect(put.ok(), await put.text()).toBe(true);
  const roster = await page.request.post(`/api/sessions/${sessionId}/roster`, {
    headers,
    data: { codes: [p === 'desktop' ? 'MDV-D-001' : 'MDV-M-001'] },
  });
  expect(roster.ok(), await roster.text()).toBe(true);

  // Người dự thi vào và bắt đầu làm bài (API) → đã có Lượt.
  const context = await browser.newContext({ baseURL: ORIGIN });
  const candidate = await context.newPage();
  await signIn(candidate, `e2e-mdv-sv-${p}`);
  const join = await candidate.request.post('/api/take/join', {
    headers,
    data: { code },
  });
  expect(join.ok(), await join.text()).toBe(true);
  const start = await candidate.request.post(`/api/take/sessions/${sessionId}/start`, {
    headers,
    data: {},
  });
  expect(start.ok(), await start.text()).toBe(true);
  await context.close();

  await page.reload();
  await openVariantsTab(page);
  await expect(page.getByRole('button', { name: 'Rút lại Mã đề này' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Rút lại tất cả Mã đề' })).toBeDisabled();
  await expect(page.getByTestId('variants-locked')).toHaveText(
    'Đã có người làm bài nên không rút lại được.',
  );
  // Vẫn xem và xem thử được.
  await expect(page.getByTestId('variant-item')).toHaveCount(15);
  await expect(page.getByRole('link', { name: 'Xem thử Mã đề này' })).toBeVisible();
});
