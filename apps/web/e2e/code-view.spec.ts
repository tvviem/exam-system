import { expect, type Page, test } from '@playwright/test';
import {
  examinerPage,
  ORIGIN,
  overflow,
  seedOpenSession,
  setViewMode,
  signIn,
} from './take-support';

// Mã lệnh trong Câu hỏi, bước M1 (docs/plan/ma-lenh-trong-cau-hoi-thiet-ke.md mục 4.2, 5): hiển thị khối mã và mã trong dòng;
// trình soạn giữ nguyên nội dung có mã. Câu hỏi gieo qua API; việc soạn mã bằng trình soạn ở code-editor.spec.ts.

const text = (value: string, code = false) => ({
  type: 'text',
  text: value,
  ...(code ? { marks: [{ type: 'code' }] } : {}),
});
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const block = (value: string) => ({ type: 'codeBlock', content: [text(value)] });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

const PROGRAM = [
  'p = L;',
  'while (p->Next != NULL)',
  '  if (p->Next->Data < 0) { t = p->Next; p->Next = t->Next; free(t); }',
  '  else p = p->Next;',
].join('\n');
const stem = doc(para(text('Biến '), text('p->Next', true), text(' trỏ đi đâu?')), block(PROGRAM));
const options = [
  { id: 'o1', content: doc(para(text('t = p->Next; p->Next = t->Next; free(t);', true))) },
  { id: 'o2', content: doc(block('free(p->Next);')) },
];

async function seedQuestion(page: Page, project: string, name: string): Promise<string> {
  await signIn(page, `e2e-ma-lenh-${project}`);
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers: { origin: ORIGIN }, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `${name} ${project}` });
  const question = await post('/api/questions', {
    type: 'single_choice',
    topicId: topic.id,
    stem,
    defaultPoints: 1,
    tags: [],
    payload: { options, key: ['o1'], shuffleOptions: false },
  });
  return question.id;
}

async function openTab(page: Page, name: 'Soạn' | 'Xem thử') {
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
  const tab = page.getByRole('tab', { name, exact: true });
  if (await tab.isVisible()) await tab.click();
}

/** Vị trí trên màn hình của lần xuất hiện thứ `nth` của `needle` trong khối mã đầu tiên. */
const measure = (page: Page, needle: string, nth = 0) =>
  page.evaluate(
    ([value, index]) => {
      const root = document.querySelector('[data-testid="question-preview"] pre') as Element;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const content = node.textContent ?? '';
        for (let at = content.indexOf(value); at >= 0; at = content.indexOf(value, at + 1)) {
          if (seen++ !== index) continue;
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + value.length);
          const rects = [...range.getClientRects()];
          return {
            left: rects[0]?.left ?? 0,
            top: rects[0]?.top ?? 0,
            rows: new Set(rects.map((r) => Math.round(r.top))).size,
          };
        }
      }
      throw new Error(`không thấy "${value}" lần ${index + 1}`);
    },
    [needle, nth] as const,
  );

test('Khối mã và mã trong dòng hiển thị rõ: phông đơn cách, số dòng, giữ thụt lề, tự xuống dòng không cắt giữa cụm', async ({
  page,
}, testInfo) => {
  const id = await seedQuestion(page, testInfo.project.name, 'Hiển thị mã');
  await page.goto(`/examiner/questions/${id}`);
  await openTab(page, 'Xem thử');
  const preview = page.getByTestId('question-preview');
  const program = preview.locator('pre').first();
  await expect(program).toBeVisible();

  const font = (selector: string) =>
    preview
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(await font('pre code')).toMatch(/mono/i);
  expect(await font('p code')).toMatch(/mono/i);

  // Số dòng chỉ ở khối nhiều dòng, trình đọc màn hình bỏ qua
  await expect(program.locator('[aria-hidden="true"]')).toHaveText(['1', '2', '3', '4']);
  await expect(preview.locator('pre').nth(1).locator('[aria-hidden="true"]')).toHaveCount(0);

  const whileLine = await measure(page, 'while');
  const ifLine = await measure(page, 'if');
  const elseLine = await measure(page, 'else');
  expect(ifLine.left - whileLine.left, 'thụt lề dòng 3').toBeGreaterThan(8);
  expect(Math.abs(elseLine.left - ifLine.left), 'dòng 3 và 4 cùng cấp').toBeLessThanOrEqual(1);

  // Dòng dài: không cụm nào bị cắt đôi; phần bị xuống dòng thụt sâu hơn đầu dòng
  for (let nth = 0; nth < 5; nth++) expect((await measure(page, 'p->Next', nth)).rows).toBe(1);
  const end = await measure(page, 'free(t);');
  if (testInfo.project.name === 'mobile') {
    expect(end.top, 'dòng dài đã xuống dòng').toBeGreaterThan(ifLine.top + 8);
    expect(end.left, 'phần xuống dòng thụt sâu hơn đầu dòng').toBeGreaterThan(ifLine.left + 8);
  }
  expect(await program.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  expect(await overflow(page), 'trang không cuộn ngang').toBeLessThanOrEqual(0);
});

test('Trình soạn mở và lưu câu có mã mà không mất mã', async ({ page }, testInfo) => {
  const id = await seedQuestion(page, testInfo.project.name, 'Sửa câu có mã');
  await page.goto(`/examiner/questions/${id}`);
  await openTab(page, 'Soạn');
  const editor = page.getByRole('textbox', { name: 'Phần dẫn' });
  await expect(editor).toContainText('while (p->Next != NULL)');
  await editor.locator('p').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Hỏi: ');
  await expect(editor.locator('p code')).toHaveText(['p->Next']);

  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Câu hỏi')).toBeVisible();
  const saved = await (await page.request.get(`/api/questions/${id}`)).json();
  expect(saved.stem.content[0].content[0].text).toBe('Hỏi: Biến ');
  expect(saved.stem.content[0].content[1]).toEqual(text('p->Next', true));
  expect(saved.stem.content[1]).toEqual(block(PROGRAM));
  expect(saved.payload.options.map((o: { content: unknown }) => o.content)).toEqual(
    options.map((o) => o.content),
  );
});

test('Màn làm bài: mã ở Phần dẫn và Phương án đọc được trên khung hẹp, chọn Phương án bằng cách chạm vào mã', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const letter = project === 'desktop' ? 'D' : 'M';
  const examiner = await examinerPage(browser, `e2e-ma-lenh-${project}`);
  await seedOpenSession(examiner, `mã ${project}`, `MALENH${letter}`, `ML-${letter}-001`, {
    single: { stem, options: [options[0]?.content, options[1]?.content] },
  });
  const context = await browser.newContext({ baseURL: ORIGIN });
  const page = await context.newPage();
  await signIn(page, `e2e-ma-lenh-sv-${project}`);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(`MALENH${letter}`);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);
  await setViewMode(page, 'Cả đề');
  await expect(page.locator('pre')).toHaveCount(2);
  expect(await overflow(page), 'màn làm bài không cuộn ngang').toBeLessThanOrEqual(0);
  for (const box of await page.locator('pre').all()) {
    expect(await box.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  }
  // Chạm đúng chỗ có mã: ô chọn phủ lên cả Phương án nên bấm theo tọa độ, như ngón tay.
  const code = page.locator('pre').nth(1);
  await code.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await code.boundingBox();
  if (!box) throw new Error('không thấy khối mã của Phương án');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('radio').nth(1)).toBeChecked();
});
