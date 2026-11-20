import { expect, type Page, test } from '@playwright/test';

// X4 (docs/plan/xuat-bo-de-thiet-ke.md mục 4 và 14): hộp thoại "Xuất Bộ đề ra Word" ở Phiên thi và Bộ đề.

const PASSWORD = 'mat-khau-on-dinh';
const ORIGIN = 'http://localhost:4173'; // server chặn yêu cầu ghi không có Origin

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

const rich = (...content: unknown[]) => ({
  type: 'doc',
  content: [{ type: 'paragraph', ...(content.length > 0 ? { content } : {}) }],
});
const text = (value: string) => ({ type: 'text', text: value });

async function post(page: Page, url: string, data: unknown) {
  const res = await page.request.post(url, { headers: { origin: ORIGIN }, data });
  expect(res.ok(), await res.text()).toBe(true);
  return res.json();
}

/** Bộ đề một câu chọn một với đề bài `stem`; `publish: false` để lại bản nháp. */
async function seedExam(page: Page, title: string, stem = rich(text('Câu A')), publish = true) {
  const topic = await post(page, '/api/topics', { name: `Chủ đề ${title}` });
  const question = await post(page, '/api/questions', {
    type: 'single_choice',
    topicId: topic.id,
    stem,
    defaultPoints: 1,
    tags: [],
    payload: {
      options: [
        { id: 'o1', content: rich(text('a')) },
        { id: 'o2', content: rich(text('b')) },
      ],
      key: ['o1'],
      shuffleOptions: true,
    },
  });
  const exam = await post(page, '/api/exams', { title });
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers: { origin: ORIGIN },
    data: {
      title,
      instructions: rich(),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: null,
          instructions: rich(),
          items: [{ questionId: question.id, points: 1 }],
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  if (publish)
    await post(page, `/api/exams/${exam.id}/publish`, { version: (await saved.json()).version });
  return exam.id as string;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Mã vào thi 6 ký tự ngẫu nhiên (hai Phiên thi cùng lúc không được trùng mã). */
const randomAccessCode = () =>
  Array.from(
    { length: 6 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('');

async function seedSession(page: Page, examId: string, title: string) {
  const session = await post(page, '/api/sessions', {
    examId,
    title,
    opensAt: '2030-01-10T08:00:00+07:00',
    closesAt: '2030-01-10T10:00:00+07:00',
    durationMinutes: 45,
    accessCode: randomAccessCode(),
  });
  return session.id as string;
}

const exportButton = (page: Page) => page.getByRole('button', { name: 'Xuất Bộ đề' });
const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Xuất Bộ đề ra Word' });

test('Phiên thi: mở hộp thoại, Học phần bắt buộc, tải về tệp Word, rồi nhớ Học phần ở lần sau', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-xuat-${p}`);
  const examId = await seedExam(page, `Xuất đề ${p} 1`);
  const sessionId = await seedSession(page, examId, `Ca xuất đề ${p} 1`);

  await page.goto(`/examiner/sessions/${sessionId}`);
  await exportButton(page).click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Tệp chỉ có đề, không có đáp án.')).toBeVisible();

  // Học phần bắt buộc: chưa nhập thì không tải được
  const download = dialog.getByRole('button', { name: 'Tải tệp Word' });
  await expect(download).toBeDisabled();
  await dialog.getByLabel('Học phần').fill('Giải tích 1');
  await expect(download).toBeEnabled();

  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(file.suggestedFilename()).toMatch(/^de-thi-.*\.docx$/);
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 2).toString('latin1'), 'tệp .docx là gói zip').toBe('PK');
  expect(bytes.length).toBeGreaterThan(1000);

  // Không có cảnh báo: hộp thoại đóng, có thông báo ngắn
  await expect(page.getByText('Đã xuất tệp')).toBeVisible();
  await expect(dialog).toBeHidden();

  // Lần sau: Học phần lần trước còn trong ô
  await page.reload();
  await exportButton(page).click();
  await expect(dialogOf(page).getByLabel('Học phần')).toHaveValue('Giải tích 1');
});

test('Phiên thi: công thức không dựng được thì tải xong vẫn giữ hộp thoại và liệt kê cảnh báo theo câu', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-xuat-${p}`);
  const stem = rich(text('Tính '), {
    type: 'math',
    attrs: { latex: '\\overset{def}{=}', display: false },
  });
  const examId = await seedExam(page, `Xuất đề ${p} 2`, stem);
  const sessionId = await seedSession(page, examId, `Ca xuất đề ${p} 2`);

  await page.goto(`/examiner/sessions/${sessionId}`);
  await exportButton(page).click();
  const dialog = dialogOf(page);
  await dialog.getByLabel('Học phần').fill('Toán');
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Tải tệp Word' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/\.docx$/);

  // Có cảnh báo: hộp thoại ở lại và liệt kê
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Đã tải tệp, nhưng có cảnh báo')).toBeVisible();
  await expect(
    dialog.getByRole('list').getByText('Câu 1: công thức chưa hỗ trợ xuất, đã in mã LaTeX'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng' }).last().click();
  await expect(dialog).toBeHidden();
});

test('Bộ đề: có nút khi đã Phát hành (xuất được), không có nút khi còn là bản nháp', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-xuat-${p}`);
  const publishedId = await seedExam(page, `Xuất đề ${p} 3`);
  const draftId = await seedExam(page, `Bản nháp ${p} 4`, rich(text('Câu nháp')), false);

  await page.goto(`/examiner/exams/${draftId}`);
  await expect(page.getByRole('heading', { name: `Bản nháp ${p} 4` })).toBeVisible();
  await expect(exportButton(page)).toHaveCount(0);

  await page.goto(`/examiner/exams/${publishedId}`);
  await exportButton(page).click();
  const dialog = dialogOf(page);
  await expect(dialog.getByText(/xuất từ Bộ đề nên chưa có ngày thi và thời gian/)).toBeVisible();
  await dialog.getByLabel('Học phần').fill('Đại số');
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Tải tệp Word' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^de-thi-.*\.docx$/);
});

test('Mẫu và công tắc: chọn Gọn tắt ô thí sinh và lưới, yêu cầu gửi đi đúng Mẫu và công tắc đã đổi', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-xuat-${p}`);
  const examId = await seedExam(page, `Xuất đề ${p} 5`);
  const sessionId = await seedSession(page, examId, `Ca xuất đề ${p} 5`);
  await page.goto(`/examiner/sessions/${sessionId}`);
  await exportButton(page).click();
  const dialog = dialogOf(page);

  await dialog.getByText('Tùy chỉnh').click();
  const candidateFields = dialog.getByLabel('Ô thí sinh, điểm và chữ ký');
  const grid = dialog.getByLabel('Lưới phiếu trả lời');
  const nationalHeader = dialog.getByLabel('Quốc hiệu và Tiêu ngữ');
  await expect(candidateFields).toBeChecked();
  await expect(grid).toBeChecked();
  await expect(nationalHeader).not.toBeChecked();

  await dialog.getByLabel('Gọn').check();
  await expect(candidateFields).not.toBeChecked();
  await expect(grid).not.toBeChecked();
  await grid.check(); // bật lại lưới trên Mẫu Gọn
  await dialog.getByLabel('Mã đề').fill(' 132 ');
  await dialog.getByLabel('Học phần').fill('Hóa học');

  const request = page.waitForRequest((r) => r.url().endsWith('/api/paper/exam'));
  await dialog.getByRole('button', { name: 'Tải tệp Word' }).click();
  expect((await request).postDataJSON()).toEqual({
    sessionId,
    course: 'Hóa học',
    examCode: '132',
    preset: 'compact',
    blocks: { grid: true },
  });
});

test('bàn phím và trợ năng: focus vào ô Học phần khi mở, Esc đóng và trả focus về nút', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-xuat-${p}`);
  const examId = await seedExam(page, `Xuất đề ${p} 6`);
  const sessionId = await seedSession(page, examId, `Ca xuất đề ${p} 6`);
  await page.goto(`/examiner/sessions/${sessionId}`);

  await exportButton(page).focus();
  await page.keyboard.press('Enter');
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Học phần')).toBeFocused();

  // Học phần để trống: Enter không gửi đi; có chữ thì Enter gửi như bấm nút
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Tải tệp Word' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(exportButton(page)).toBeFocused();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`bố cục (${scheme}): hộp thoại mở và đã bung "Tùy chỉnh" không tràn ngang, nằm trọn trong màn hình, nút đủ lớn`, async ({
    page,
  }, testInfo) => {
    const p = testInfo.project.name;
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, `e2e-xuat-${p}`);
    const examId = await seedExam(page, `Xuất đề ${p} 7${scheme}`);
    const sessionId = await seedSession(page, examId, `Ca xuất đề ${p} 7${scheme}`);
    await page.goto(`/examiner/sessions/${sessionId}`);
    await exportButton(page).click();
    const dialog = dialogOf(page);
    await dialog.getByText('Tùy chỉnh').click();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'cuộn ngang của trang').toBe(0);
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
    // Nội dung hộp thoại cuộn được (không tràn khỏi màn hình thấp), và các nút chính nằm trong tầm bấm
    const dialogHeight = box?.height ?? 0;
    expect(dialogHeight).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
    const primary = dialog.getByRole('button', { name: 'Tải tệp Word' });
    await primary.scrollIntoViewIfNeeded();
    const button = await primary.boundingBox();
    expect(button?.height ?? 0, 'nút chính đủ lớn để chạm').toBeGreaterThanOrEqual(
      testInfo.project.name === 'mobile' ? 44 : 36,
    );
  });
}

test('tệp Đáp án: có bước xác nhận (Hủy thì không tải), xác nhận thì tải dap-an-*.docx và yêu cầu mang confirm', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-xuat-${p}`);
  const examId = await seedExam(page, `Xuất đề ${p} 8`);
  const sessionId = await seedSession(page, examId, `Ca xuất đề ${p} 8`);
  let downloads = 0;
  page.on('download', () => {
    downloads += 1;
  });

  await page.goto(`/examiner/sessions/${sessionId}`);
  await exportButton(page).click();
  const dialog = dialogOf(page);
  await expect(dialog.getByText('Đáp án và thang điểm')).toBeVisible();

  // Học phần bắt buộc, như tệp Đề
  const answers = dialog.getByRole('button', { name: 'Tải tệp Đáp án…' });
  await expect(answers).toBeDisabled();
  await dialog.getByLabel('Học phần').fill('Giải tích 1');
  await dialog.getByLabel('Gọn').check();
  await answers.click();

  // Bước xác nhận: cảnh báo tệp chứa đáp án; Hủy quay về biểu mẫu, không tải gì
  await expect(dialog.getByText('Tệp này chứa đáp án đúng')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Hủy' })).toBeFocused();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'cuộn ngang ở bước xác nhận').toBe(0);
  await dialog.getByRole('button', { name: 'Hủy' }).click();
  await expect(dialog.getByLabel('Học phần')).toHaveValue('Giải tích 1');
  await page.waitForTimeout(500);
  expect(downloads, 'Hủy không được tải tệp').toBe(0);

  // Xác nhận: tải tệp Đáp án; yêu cầu có confirm và không có Mẫu (tệp Đáp án chỉ một khuôn)
  await answers.click();
  const request = page.waitForRequest((r) => r.url().endsWith('/api/paper/answers'));
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Tôi hiểu, tải tệp Đáp án' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^dap-an-.*\.docx$/);
  const { readFile } = await import('node:fs/promises');
  expect((await readFile(await file.path())).subarray(0, 2).toString('latin1')).toBe('PK');
  expect((await request).postDataJSON()).toEqual({
    sessionId,
    course: 'Giải tích 1',
    confirm: true,
  });
  await expect(page.getByText('Đã xuất tệp Đáp án')).toBeVisible();
  await expect(dialog).toBeHidden();
});

test('tệp Đáp án: Esc ở bước xác nhận đóng hộp thoại, không tải gì', async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-xuat-${p}`);
  const examId = await seedExam(page, `Xuất đề ${p} 9`);
  let downloads = 0;
  page.on('download', () => {
    downloads += 1;
  });
  await page.goto(`/examiner/exams/${examId}`);
  await exportButton(page).click();
  const dialog = dialogOf(page);
  await dialog.getByLabel('Học phần').fill('Hóa');
  await dialog.getByRole('button', { name: 'Tải tệp Đáp án…' }).click();
  await expect(dialog.getByText('Tệp này chứa đáp án đúng')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(300);
  expect(downloads).toBe(0);
});
