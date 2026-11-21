import { expect, type Page, test } from '@playwright/test';
import { examinerPage, ORIGIN, overflow, signIn } from './take-support';

// R4c (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 4.6): Người dự thi biết bài rút ngẫu nhiên, thấy "Câu x/N" đúng N;
// Người ra đề Xem thử một lượt rút mẫu.

const headers = { origin: ORIGIN };

const rich = (text: string) => ({
  type: 'doc',
  content: [
    text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
  ],
});

/** Chụp ảnh để xem bằng mắt khi đặt SHOTS=<thư mục> (không chụp trong CI). */
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/nguoi-du-thi-${name}.png` });
};

/** Bộ đề đã Phát hành (Phần I 10 câu × 1 điểm rút 40 %, Phần II 5 câu × 2 điểm đủ) và hai Phiên thi đang mở. */
async function seedSessions(
  examiner: Page,
  tag: string,
  codes: { drawn: string; full: string },
  candidate: string,
) {
  const post = async (url: string, data: unknown) => {
    const res = await examiner.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `Chủ đề rút ${tag}` });
  const ids: string[] = [];
  for (let n = 1; n <= 15; n++) {
    const q = await post('/api/questions', {
      type: 'single_choice',
      topicId: topic.id,
      stem: rich(`Câu hỏi số ${n} ${tag}`),
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
  const exam = await post('/api/exams', { title: `Đề rút ${tag}` });
  const saved = await examiner.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: `Đề rút ${tag}`,
      instructions: rich(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: 'Phần I',
          instructions: rich(''),
          drawPercent: 40,
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
  await post(`/api/exams/${exam.id}/publish`, { version: (await saved.json()).version });
  const detail = await (await examiner.request.get(`/api/exams/${exam.id}`)).json();
  const now = Date.now();
  const open = {
    examId: exam.id,
    opensAt: new Date(now - 10 * 60_000).toISOString(),
    closesAt: new Date(now + 4 * 3_600_000).toISOString(),
    durationMinutes: 30,
  };
  const drawn = await post('/api/sessions', {
    ...open,
    title: `Ca rút ${tag}`,
    accessCode: codes.drawn,
  });
  const full = await post('/api/sessions', {
    ...open,
    title: `Ca đủ ${tag}`,
    accessCode: codes.full,
    // Ghi đè 100 % ở Phiên thi: lấy đủ mọi câu dù Bộ đề mặc định rút 40 %.
    sectionDraws: [{ sectionId: detail.sections[0].id, percent: 100 }],
  });
  for (const session of [drawn, full]) {
    await post(`/api/sessions/${session.id}/roster`, { codes: [candidate] });
  }
  return { drawnId: drawn.id as string, fullId: full.id as string };
}

test('Người dự thi biết bài rút ngẫu nhiên, thấy Câu x/N đúng N và giữ nguyên bộ câu khi tải lại; Xem thử một lượt rút', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const run = `${testInfo.repeatEachIndex}${testInfo.retry}`;
  const codes = { drawn: `RCD${tag}${run}`, full: `RCF${tag}${run}` };
  const examiner = await examinerPage(browser, `e2e-rcs-${p}`);
  const { drawnId } = await seedSessions(examiner, `${p}-${run}`, codes, `RCS-${tag}-001`);

  await signIn(page, `e2e-rcs-sv-${p}`);

  // Phiên thi lấy đủ (ghi đè 100 %): không nói là rút ngẫu nhiên, 15 câu.
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(codes.full);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await expect(page.getByText('15 câu', { exact: true })).toBeVisible();
  await expect(page.getByTestId('drawn-notice')).toHaveCount(0);

  // Phiên thi rút câu: màn xác nhận nói rõ 9 câu rút từ 15 câu.
  await page.goto('/take');
  await expect(page.getByText(/9 câu · rút ngẫu nhiên/)).toBeVisible(); // dòng trong danh sách Phiên thi
  await page.getByLabel('Mã vào thi').fill(codes.drawn);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await expect(page.getByTestId('drawn-notice')).toContainText(
    'Bài của bạn gồm 9 câu, rút ngẫu nhiên từ 15 câu của Bộ đề.',
  );
  await expect(page.getByTestId('drawn-notice')).toContainText('vẫn nhận đúng bộ câu này');
  await expect(page.getByText('9 câu', { exact: true })).toBeVisible();
  expect(await overflow(page), 'màn xác nhận có rút câu').toBe(0);
  await shot(page, `xac-nhan-${p}`);

  // Làm bài: Câu 1/9, ô đã làm 0/9; tải lại vẫn đúng bộ câu.
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);
  // Máy tính mở sẵn "Cả đề"; chuyển sang "Từng câu" để thấy "Câu x/N" (điện thoại vốn đã ở chế độ này).
  await page.getByRole('button', { name: 'Từng câu' }).click();
  await expect(page.getByText('Câu 1/9', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Danh sách câu/ })).toContainText(
    'Đã làm 0/9 câu',
  );
  const stems = async () =>
    (await page.getByText(/Câu hỏi số \d+/).allTextContents()).map((s) => s.trim());
  const first = await stems();
  expect(first.length).toBeGreaterThan(0);
  await shot(page, `lam-bai-${p}`);
  await page.reload();
  await expect(page.getByText('Câu 1/9', { exact: true })).toBeVisible();
  expect(await stems()).toEqual(first);

  // Người ra đề Xem thử: một lượt rút mẫu 9 trong 15 câu.
  await examiner.goto(`/examiner/sessions/${drawnId}/try`);
  await expect(examiner.getByTestId('preview-draw')).toContainText(
    'gồm 9 câu trong 15 câu của Bộ đề',
  );
  await examiner.getByRole('button', { name: 'Từng câu' }).click();
  await expect(examiner.getByText('Câu 1/9', { exact: true })).toBeVisible();
  await shot(examiner, `xem-thu-${p}`);
});
