import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';
import { chooseTopic } from './topic-support';
import { workbook, XLSX_MIME } from './xlsx';

// Mã lệnh trong Câu hỏi, bước M2 (docs/plan/ma-lenh-trong-cau-hoi-thiet-ke.md mục 4.3, 4.4): soạn khối mã, mã trong dòng
// bằng trình soạn và nhập từ Excel.

async function topicFor(page: Page, info: TestInfo, name: string): Promise<string> {
  const project = info.project.name;
  await signIn(page, `e2e-ma-lenh-${project}`);
  const res = await page.request.post('/api/topics', {
    headers: { origin: ORIGIN },
    // Kèm số lần chạy lại để không trùng tên.
    data: { name: `${name} ${project} ${info.retry}` },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).id;
}

const paste = (page: Page, type: 'text/plain' | 'text/html', value: string) =>
  page.evaluate(
    ([mime, text]) => {
      const data = new DataTransfer();
      data.setData(mime, text);
      document.activeElement?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    },
    [type, value] as const,
  );

const text = (value: string, code = false) => ({
  type: 'text',
  text: value,
  ...(code ? { marks: [{ type: 'code' }] } : {}),
});

test('Soạn mã bằng nút: mã trong dòng, khối mã, Tab thụt lề, Escape rồi Tab để ra khỏi ô, chặn khi quá dài', async ({
  page,
}, testInfo) => {
  await topicFor(page, testInfo, 'Soạn mã');
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Soạn câu hỏi' }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /^Chọn một/ })
    .click();
  const stem = page.getByRole('textbox', { name: 'Phần dẫn' });
  const bar = page.getByRole('toolbar', { name: /Phần dẫn/ });
  const inline = bar.getByRole('button', { name: 'Mã trong dòng' });
  const block = bar.getByRole('button', { name: 'Khối mã' });

  await stem.click();
  await page.keyboard.type('Biến ');
  await inline.click();
  await expect(inline).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('p->Next');
  await inline.click();
  await page.keyboard.type(' dùng ở đâu?');
  await page.keyboard.press('Enter');
  await block.click();
  await expect(block).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('for (i = 0; i < n; i++)');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('s += *a;');
  const code = 'for (i = 0; i < n; i++)\n  s += *a;';
  await expect(stem.locator('pre')).toHaveText(code, { useInnerText: false });
  expect(await overflow(page), 'thanh công cụ không làm cuộn ngang').toBeLessThanOrEqual(0);

  // Quá giới hạn thì không nhận và báo lý do; sửa tiếp được thì hết báo
  const limit = page.getByRole('alert').filter({ hasText: 'Khối mã tối đa' });
  await paste(page, 'text/plain', 'x'.repeat(4001));
  await expect(limit).toBeVisible();
  await expect(stem.locator('pre')).toHaveText(code, { useInnerText: false });
  await page.keyboard.type('!');
  await expect(limit).toBeHidden();

  // Bàn phím: Escape rồi Tab thì rời ô soạn thay vì thụt lề
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(stem).not.toBeFocused();
  await expect(stem.locator('pre')).toHaveText(`${code}!`, { useInnerText: false });

  await page.getByRole('textbox', { name: 'Phương án A' }).click();
  await page
    .getByRole('toolbar', { name: /Phương án A/ })
    .getByRole('button', { name: 'Mã trong dòng' })
    .click();
  await page.keyboard.type('p = p->Next;');
  // Dán đoạn mã từ trang web (HTML <pre>) thành khối mã, giữ thụt lề
  await page.getByRole('textbox', { name: 'Phương án B' }).click();
  await paste(page, 'text/html', '<pre>while (p)\n    p = p->Next;</pre>');
  await expect(page.getByRole('textbox', { name: 'Phương án B' }).locator('pre')).toHaveCount(1);
  await page.getByRole('radio', { name: /Phương án A/ }).check();

  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').pop();
  const saved = await (await page.request.get(`/api/questions/${id}`)).json();
  expect(saved.stem.content).toEqual([
    { type: 'paragraph', content: [text('Biến '), text('p->Next', true), text(' dùng ở đâu?')] },
    { type: 'codeBlock', content: [text(`${code}!`)] },
  ]);
  expect(saved.payload.options[0].content.content).toEqual([
    { type: 'paragraph', content: [text('p = p->Next;', true)] },
  ]);
  expect(saved.payload.options[1].content.content[0]).toEqual({
    type: 'codeBlock',
    content: [text('while (p)\n    p = p->Next;')],
  });
});

test('Nhập Excel có đánh dấu mã: xem trước thấy khối mã, tạo xong câu hỏi giữ đúng mã', async ({
  page,
}, testInfo) => {
  const topicId = await topicFor(page, testInfo, 'Nhập mã');
  const file = await workbook({
    'Chọn một': [
      ['Nội dung', 'Phương án A', 'Phương án B', 'Đáp án'],
      [
        'Đoạn sau in gì với `n = 3`?\n```\nfor (i = 0; i < n; i++)\n    s += i;\n```',
        '`s = 3`',
        '```\ns = 0;\n```',
        'A',
      ],
    ],
  });
  await page.goto('/examiner/questions/import');
  await chooseTopic(page, `Nhập mã ${testInfo.project.name} ${testInfo.retry}`);
  await page
    .getByLabel('File câu hỏi (.xlsx)')
    .setInputFiles({ name: 'ma.xlsx', mimeType: XLSX_MIME, buffer: file });
  await page.getByRole('button', { name: 'Tải lên và xem trước' }).click();
  await page
    .getByRole('button', { name: /^Xem dòng 2/ })
    .locator('visible=true')
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('pre')).toHaveCount(2);
  await expect(dialog.locator('p code')).toHaveText(['n = 3', 's = 3']);
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await page.getByRole('button', { name: 'Tạo 1 câu hỏi' }).click();
  await expect(page.getByText(/Đã tạo 1 câu hỏi/)).toBeVisible();

  const list = await (await page.request.get(`/api/questions?topicId=${topicId}`)).json();
  const saved = await (await page.request.get(`/api/questions/${list.items[0].id}`)).json();
  expect(saved.stem.content[1]).toEqual({
    type: 'codeBlock',
    content: [text('for (i = 0; i < n; i++)\n    s += i;')],
  });
});
