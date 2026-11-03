import { expect, test } from '@playwright/test';
import { examinerPage, seedOpenSession, signIn } from './take-support';

// Chữ có chân Noto Serif cho nội dung đề (Q101, Q240): máy nào cũng thấy cùng một phông, kể cả máy không cài sẵn.

test('Nội dung đề dùng Noto Serif tự host, phần giao diện vẫn là Be Vietnam Pro', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const code = `TKFT${tag}`;
  const examiner = await examinerPage(browser, `e2e-lb-gv-${p}`);
  await seedOpenSession(examiner, `${p}-ft`, code, `TK9-${tag}-001`);

  await signIn(page, `e2e-lb-ft-${p}`);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);
  await page.getByRole('button', { name: 'Cả đề' }).click();
  const stem = page.getByText(`Trình bày định nghĩa giới hạn ${p}-ft`);
  await expect(stem).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const fontsOf = async (selector: string) => {
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map((font) => `${font.familyName}${font.isCustomFont ? '' : ' (hệ thống)'}`);
  };
  await stem.evaluate((el) => el.setAttribute('data-probe', 'stem'));
  await page
    .getByRole('button', { name: 'Cả đề' })
    .evaluate((el) => el.setAttribute('data-probe', 'chrome'));

  // Chữ có dấu chồng trong đề lấy từ phông tự host, không rơi về phông của máy
  expect(await fontsOf('[data-probe="stem"]')).toEqual(['Noto Serif']);
  expect(await fontsOf('[data-probe="chrome"]')).toEqual([
    expect.stringMatching(/^Be Vietnam Pro/),
  ]); // tên có thêm độ đậm
});
