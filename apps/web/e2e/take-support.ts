import { type Browser, expect, type Page } from '@playwright/test';

// Dùng chung cho các spec của khu làm bài: dựng Bộ đề và Phiên thi đang mở bằng API của Người ra đề.

const PASSWORD = 'mat-khau-on-dinh';
export const ORIGIN = 'http://localhost:4173'; // server chặn yêu cầu ghi không có Origin

export async function signIn(page: Page, username: string) {
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

/** Bộ đề đủ bốn Loại câu và một Phiên thi đang mở có sẵn người dự thi, dựng qua API của Người ra đề. */
export async function seedOpenSession(
  examiner: Page,
  tag: string,
  code: string,
  candidateCode: string,
  options: { essayLatex?: string; opensInMs?: number } = {},
) {
  const headers = { origin: ORIGIN };
  const post = async (url: string, data: unknown) => {
    const res = await examiner.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `Chủ đề làm bài ${tag}` });
  const common = { topicId: topic.id, tags: [] as string[] };
  const single = await post('/api/questions', {
    ...common,
    type: 'single_choice',
    stem: rich(`Thủ đô của Việt Nam ${tag}?`),
    defaultPoints: 1,
    payload: {
      options: [
        { id: 'o1', content: rich('Hà Nội') },
        { id: 'o2', content: rich('Huế') },
      ],
      key: ['o1'],
      shuffleOptions: false,
    },
  });
  const multiple = await post('/api/questions', {
    ...common,
    type: 'multiple_choice',
    stem: rich(`Chọn các số nguyên tố ${tag}`),
    defaultPoints: 2,
    payload: {
      options: [
        { id: 'o1', content: rich('hai') },
        { id: 'o2', content: rich('bốn') },
        { id: 'o3', content: rich('bảy') },
      ],
      key: ['o1', 'o3'],
      scoringRule: 'proportional',
      shuffleOptions: false,
    },
  });
  const cluster = await post('/api/questions', {
    ...common,
    type: 'true_false_cluster',
    stem: rich(`Xét hàm số bậc ba ${tag}`),
    defaultPoints: 1,
    payload: {
      statements: [
        { id: 's1', content: rich('đồng biến trên R'), key: true },
        { id: 's2', content: rich('có cực trị'), key: false },
      ],
      scoringRule: 'ladder',
      ladder: [0, 0.25, 1],
    },
  });
  const essay = await post('/api/questions', {
    ...common,
    type: 'essay',
    stem: options.essayLatex
      ? {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: `Trình bày định nghĩa giới hạn ${tag}: ` },
                { type: 'math', attrs: { latex: options.essayLatex, display: false } },
              ],
            },
          ],
        }
      : rich(`Trình bày định nghĩa giới hạn ${tag}`),
    defaultPoints: 5,
    payload: { maxLength: 1000, rubric: rich('Nêu đủ ε-δ') },
  });
  const exam = await post('/api/exams', { title: `Đề làm bài ${tag}` });
  const saved = await examiner.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: `Đề làm bài ${tag}`,
      instructions: rich('Làm bài cẩn thận'),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: null,
          instructions: { type: 'doc', content: [{ type: 'paragraph' }] },
          items: [single, multiple, cluster, essay].map((q, i) => ({
            questionId: q.id,
            points: [1, 2, 1, 5][i],
          })),
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await post(`/api/exams/${exam.id}/publish`, { version: (await saved.json()).version });
  const now = Date.now();
  const session = await post('/api/sessions', {
    examId: exam.id,
    title: `Ca làm bài ${tag}`,
    opensAt: new Date(now + (options.opensInMs ?? -10 * 60_000)).toISOString(),
    closesAt: new Date(now + 4 * 3_600_000).toISOString(),
    durationMinutes: 30,
    accessCode: code,
  });
  await post(`/api/sessions/${session.id}/roster`, { codes: [candidateCode] });
  return session.id as string;
}

export async function examinerPage(browser: Browser, username: string) {
  const context = await browser.newContext({ baseURL: ORIGIN });
  const page = await context.newPage();
  await signIn(page, username);
  return page;
}

export const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
