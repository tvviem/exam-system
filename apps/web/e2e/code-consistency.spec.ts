import { type Browser, expect, type Page, type TestInfo, test } from '@playwright/test';
import {
  examinerPage,
  ORIGIN,
  overflow,
  seedOpenSession,
  setViewMode,
  signIn,
} from './take-support';
import { chooseTopic } from './topic-support';
import { workbook, XLSX_MIME } from './xlsx';

// Mã lệnh hiển thị thống nhất (docs/plan/ma-lenh-trong-cau-hoi-thiet-ke.md mục 9): cùng một nội dung soạn trên web hay nạp
// từ Excel cho cùng một kết quả; cỡ chữ của Người dự thi áp dụng cả cho mã; dấu ngoặc đi liền với mã.

const text = (value: string, code = false) => ({
  type: 'text',
  text: value,
  ...(code ? { marks: [{ type: 'code' }] } : {}),
});
const PROGRAM = 'if (p) {\n  x++;\n}';

async function post(page: Page, url: string, data: unknown) {
  const res = await page.request.post(url, { headers: { origin: ORIGIN }, data });
  expect(res.ok(), await res.text()).toBe(true);
  return res.json();
}

const savedQuestion = async (page: Page, id: string) =>
  (await page.request.get(`/api/questions/${id}`)).json();

async function previewStem(page: Page, id: string) {
  await page.goto(`/examiner/questions/${id}`);
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
  const tab = page.getByRole('tab', { name: 'Xem thử' });
  if (await tab.isVisible()) await tab.click();
  const preview = page.getByTestId('question-preview');
  await expect(preview.locator('pre')).toBeVisible();
  return {
    text: await preview.locator('pre').textContent(),
    inline: await preview.locator('p code').allTextContents(),
  };
}

test('Soạn trên web và nạp từ Excel cùng một nội dung thì lưu và hiển thị giống nhau', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page, `e2e-ma-lenh-${project}`);

  // Soạn trên web
  await post(page, '/api/topics', { name: `Thống nhất web ${project} ${testInfo.retry}` });
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Soạn câu hỏi' }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /^Chọn một/ })
    .click();
  const stem = page.getByRole('textbox', { name: 'Phần dẫn' });
  const bar = page.getByRole('toolbar', { name: /Phần dẫn/ });
  await stem.click();
  await page.keyboard.type('Cho ');
  await bar.getByRole('button', { name: 'Mã trong dòng' }).click();
  await page.keyboard.type('p->Next');
  await bar.getByRole('button', { name: 'Mã trong dòng' }).click();
  await page.keyboard.press('Enter');
  await bar.getByRole('button', { name: 'Khối mã' }).click();
  await page.keyboard.type('if (p) {');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('x++;');
  await page.keyboard.press('Enter');
  await page.keyboard.type('}');
  // Ô soạn mã: tab rộng như màn làm bài, bàn phím điện thoại không tự sửa chữ trong mã
  const editing = stem.locator('pre');
  expect(await editing.evaluate((el) => getComputedStyle(el).tabSize)).toBe('2');
  await expect(editing).toHaveAttribute('autocapitalize', 'off');
  await expect(editing).toHaveAttribute('autocorrect', 'off');
  await expect(editing).toHaveAttribute('spellcheck', 'false');
  await page.getByRole('textbox', { name: 'Phương án A' }).click();
  await page.keyboard.type('một');
  await page.getByRole('textbox', { name: 'Phương án B' }).click();
  await page.keyboard.type('hai');
  await page.getByRole('radio', { name: /Phương án A/ }).check();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
  const typedId = new URL(page.url()).pathname.split('/').pop() as string;

  // Nạp từ Excel, ghi cả tên ngôn ngữ sau ```
  const topic = await post(page, '/api/topics', {
    name: `Thống nhất Excel ${project} ${testInfo.retry}`,
  });
  await page.goto('/examiner/questions/import');
  await chooseTopic(page, `Thống nhất Excel ${project} ${testInfo.retry}`);
  await page.getByLabel('File câu hỏi (.xlsx)').setInputFiles({
    name: 'ma.xlsx',
    mimeType: XLSX_MIME,
    buffer: await workbook({
      'Chọn một': [
        ['Nội dung', 'Phương án A', 'Phương án B', 'Đáp án'],
        [`Cho \`p->Next\`\n\`\`\`c\n${PROGRAM}\n\`\`\``, 'một', 'hai', 'A'],
      ],
    }),
  });
  await page.getByRole('button', { name: 'Tải lên và xem trước' }).click();
  await page.getByRole('button', { name: 'Tạo 1 câu hỏi' }).click();
  await expect(page.getByText(/Đã tạo 1 câu hỏi/)).toBeVisible();
  const list = await (await page.request.get(`/api/questions?topicId=${topic.id}`)).json();
  const importedId = list.items[0].id as string;

  const expected = [
    { type: 'paragraph', content: [text('Cho '), text('p->Next', true)] },
    { type: 'codeBlock', content: [text(PROGRAM)] },
  ];
  expect((await savedQuestion(page, typedId)).stem.content).toEqual(expected);
  expect((await savedQuestion(page, importedId)).stem.content).toEqual(expected);
  const typed = await previewStem(page, typedId);
  expect(await previewStem(page, importedId)).toEqual(typed);
  expect(typed.inline).toEqual(['p->Next']);
});

async function candidateOnCodeQuestion(browser: Browser, info: TestInfo) {
  const project = info.project.name;
  const letter = project === 'desktop' ? 'D' : 'M';
  const examiner = await examinerPage(browser, `e2e-ma-lenh-${project}`);
  const rich = (...content: unknown[]) => ({ type: 'doc', content });
  const code = `COCHU${letter}${info.retry}`;
  await seedOpenSession(examiner, `cỡ chữ ${project} ${info.retry}`, code, `ML-${letter}-001`, {
    single: {
      stem: rich(
        { type: 'paragraph', content: [text('Cho '), text('p->Next', true)] },
        { type: 'codeBlock', content: [text(PROGRAM)] },
      ),
      options: [
        // cụm 16 ký tự (giữ liền) và một cụm dài hơn cả khung (được ngắt)
        rich({ type: 'paragraph', content: [text('p->Next->Data==0 (abcdefghijklm)', true)] }),
        rich({ type: 'paragraph', content: [text(`x=${'y'.repeat(70)};`, true)] }),
      ],
    },
  });
  const context = await browser.newContext({ baseURL: ORIGIN });
  const page = await context.newPage();
  await signIn(page, `e2e-ma-lenh-sv-${project}`);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);
  await setViewMode(page, 'Cả đề');
  return page;
}

test('Người dự thi tăng cỡ chữ thì mã to theo đúng tỷ lệ', async ({ browser }, testInfo) => {
  const page = await candidateOnCodeQuestion(browser, testInfo);
  const size = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  await expect(page.locator('pre')).toBeVisible();
  const before = { block: await size('pre'), inline: await size('p code') };
  await page.getByRole('button', { name: 'Hiển thị' }).click();
  await page.getByRole('dialog', { name: 'Hiển thị' }).getByText('130%').click();
  await expect.poll(() => size('pre')).toBeCloseTo(before.block * 1.3, 1);
  expect(await size('p code')).toBeCloseTo(before.inline * 1.3, 1);
  expect(await overflow(page), 'chữ to, mã dài: vẫn không cuộn ngang').toBeLessThanOrEqual(0);
});

test('Dấu ngoặc quanh mã trong dòng không bị rớt lại cuối dòng', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page, `e2e-ma-lenh-${project}`);
  const topic = await post(page, '/api/topics', { name: `Dấu ngoặc ${project} ${testInfo.retry}` });
  // 40 dòng dài dần, để dấu "(" lần lượt rơi vào mọi vị trí quanh mép phải.
  const content = Array.from({ length: 40 }, (_, i) => [
    ...(i > 0 ? [{ type: 'hardBreak' }] : []),
    text(
      `${'a '.repeat(4)}${'b'.repeat((i % 10) + 1)} ${'c '.repeat(Math.floor(i / 10) * 3)}vị trí (`,
    ),
    text('p->Next', true),
    text(') nhé'),
  ]).flat();
  const question = await post(page, '/api/questions', {
    type: 'essay',
    topicId: topic.id,
    stem: { type: 'doc', content: [{ type: 'paragraph', content }] },
    defaultPoints: 1,
    tags: [],
    payload: { maxLength: 500 },
  });
  await page.goto(`/examiner/questions/${question.id}`);
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
  const tab = page.getByRole('tab', { name: 'Xem thử' });
  if (await tab.isVisible()) await tab.click();
  await expect(page.getByTestId('question-preview').locator('p code').first()).toBeVisible();
  const split = await page.evaluate(() => {
    const preview = document.querySelector('[data-testid="question-preview"]') as Element;
    const edge = (node: Node, at: number) => {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      return range.getBoundingClientRect();
    };
    return [...preview.querySelectorAll('p code')].filter((code) => {
      const before = code.previousSibling as Text;
      const after = code.nextSibling as Text;
      const box = code.getBoundingClientRect();
      const open = edge(before, before.textContent?.lastIndexOf('(') as number);
      const close = edge(after, after.textContent?.indexOf(')') as number);
      const sameLine = (a: DOMRect) =>
        Math.abs(a.top + a.height / 2 - (box.top + box.height / 2)) < 8;
      return !sameLine(open) || !sameLine(close);
    }).length;
  });
  expect(split, 'số chỗ dấu ngoặc bị tách khỏi mã').toBe(0);
});
