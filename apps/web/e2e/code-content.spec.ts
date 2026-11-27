import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';

// Mã lệnh trong Câu hỏi, bước 0 (docs/plan/ma-lenh-trong-cau-hoi-thiet-ke.md mục 3): thụt lề giữ nguyên khi hiển thị, và
// trình soạn không tự đổi dấu * hay _ của mã thành chữ nghiêng, đậm.

async function newQuestion(page: Page, info: TestInfo, topic: string) {
  const project = info.project.name;
  await signIn(page, `e2e-ma-lenh-${project}`);
  const res = await page.request.post('/api/topics', {
    headers: { origin: ORIGIN },
    // Kèm số lần chạy lại để không trùng tên.
    data: { name: `${topic} ${project} ${info.retry}` },
  });
  expect(res.ok(), await res.text()).toBe(true);
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Soạn câu hỏi' }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /^Chọn một/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Soạn câu hỏi', level: 1 })).toBeVisible();
  return page.getByRole('textbox', { name: 'Phần dẫn' });
}

/** Dán chữ thuần vào ô đang chọn, như Ctrl+V từ trình soạn mã. */
const paste = (page: Page, text: string) =>
  page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    document.activeElement?.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);

test('Trình soạn giữ nguyên dấu * và _ khi gõ và khi dán; nút In đậm vẫn dùng được', async ({
  page,
}, testInfo) => {
  const stem = await newQuestion(page, testInfo, 'Gõ mã');
  await stem.click();
  const typed = ['int *p, *q;', 's = a **b** c;', 'x = _y_ + __z__;'];
  for (const line of typed) {
    await page.keyboard.type(line);
    await page.keyboard.press('Shift+Enter');
  }
  const pasted = 'r = *m + *n; k = **t**;';
  await paste(page, pasted);
  for (const line of [...typed, pasted]) await expect(stem).toContainText(line);
  await expect(stem.locator('em, strong')).toHaveCount(0);

  await page.keyboard.press('Shift+Enter');
  await page
    .getByRole('toolbar', { name: /Phần dẫn/ })
    .getByRole('button', { name: 'Đậm', exact: true })
    .click();
  await page.keyboard.type('đậm');
  await expect(stem.locator('strong')).toHaveText('đậm');

  // Gõ tắt tạo danh sách vẫn như cũ.
  await page.keyboard.press('Enter');
  await page.keyboard.type('- một mục');
  await expect(stem.locator('ul li')).toContainText('một mục');
});

/** Mép trái (px) của ký tự khác khoảng trắng đầu tiên ở dòng chứa `needle`, trong vùng `root`. */
const lineStart = (page: Page, needle: string) =>
  page.evaluate((value) => {
    const root = document.querySelector('[data-testid="question-preview"]') as Element;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      if (!text.includes(value)) continue;
      const range = document.createRange();
      const at = text.search(/\S/);
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      return range.getBoundingClientRect().left;
    }
    throw new Error(`không thấy dòng "${value}"`);
  }, needle);

test('Thụt lề của đoạn mã hiện đúng ở bản xem trước, cả sau khi lưu, không cuộn ngang', async ({
  page,
}, testInfo) => {
  const stem = await newQuestion(page, testInfo, 'Thụt lề');
  await stem.click();
  const lines = [
    'Đoạn mã sau chạy bao nhiêu lần?',
    'for (i = 0; i < n; i++)',
    '    for (j = 0; j < n; j++)',
    '        if (a[i] > a[j] && a[j] != 0 && i != j) dem = dem + 1;',
  ];
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press('Shift+Enter');
    await page.keyboard.type(line);
  }
  await page.getByRole('textbox', { name: 'Phương án A' }).click();
  await page.keyboard.type('n');
  await page.getByRole('textbox', { name: 'Phương án B' }).click();
  await page.keyboard.type('n * n');
  await page.getByRole('radio', { name: /Phương án B/ }).check();

  const check = async (step: string) => {
    const previewTab = page.getByRole('tab', { name: 'Xem thử' });
    if (await previewTab.isVisible()) await previewTab.click();
    await expect(page.getByTestId('question-preview')).toContainText('dem = dem + 1;');
    const outer = await lineStart(page, 'for (i = 0');
    const middle = await lineStart(page, 'for (j = 0');
    const inner = await lineStart(page, 'if (a[i]');
    expect(middle - outer, `${step}: thụt lề cấp 1`).toBeGreaterThan(8);
    expect(inner - middle, `${step}: thụt lề cấp 2`).toBeGreaterThan(8);
    expect(await overflow(page), `${step}: không cuộn ngang`).toBeLessThanOrEqual(0);
  };
  await check('đang soạn');

  const editTab = page.getByRole('tab', { name: 'Soạn', exact: true });
  if (await editTab.isVisible()) await editTab.click();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
  await check('sau khi lưu và tải lại');
});
