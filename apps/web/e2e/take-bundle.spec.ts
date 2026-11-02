import { gzipSync } from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { examinerPage, seedOpenSession, signIn } from './take-support';

// B1 (Q246): JS riêng của khu làm bài (phần ngoài lõi dùng chung với trang Tài khoản) ≤ 40 KB gzip, và các gói nặng
// (trình soạn, KaTeX, MathLive) không được tải ở khu này khi đề không có công thức.

const BUDGET_BYTES = 40 * 1024;
const FORBIDDEN = /rich-text-editor|math-dialog|katex|mathlive|tiptap/i;

async function scriptsLoadedBy(page: Page, path: string) {
  const loaded = new Map<string, number>();
  const onResponse = async (response: import('@playwright/test').Response) => {
    if (response.request().resourceType() !== 'script') return;
    const body = await response.body().catch(() => null);
    if (body) loaded.set(new URL(response.url()).pathname, gzipSync(body).length);
  };
  page.on('response', onResponse);
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  page.off('response', onResponse);
  return loaded;
}

test('Khu làm bài: JS riêng ≤ 40 KB gzip, không tải trình soạn hay KaTeX (B1)', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const examiner = await examinerPage(browser, `e2e-lb-gv-${p}`);
  await seedOpenSession(examiner, `${p}-bd`, `TKBD${tag}`, `TK3-${tag}-001`);

  await signIn(page, `e2e-lb-bd-${p}`);
  const baseline = await scriptsLoadedBy(page, '/account');
  // Trang mới hoàn toàn (không dùng lại bộ nhớ đệm của phiên): mở /take, vào thi, bắt đầu.
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(`TKBD${tag}`);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);
  const take = await scriptsLoadedBy(page, page.url().replace(/^https?:\/\/[^/]+/, ''));

  const own = [...take].filter(([path]) => !baseline.has(path));
  const ownBytes = own.reduce((sum, [, bytes]) => sum + bytes, 0);
  testInfo.annotations.push({ type: 'js-gzip-kb', description: (ownBytes / 1024).toFixed(1) });
  expect(
    ownBytes,
    `JS riêng của khu làm bài: ${(ownBytes / 1024).toFixed(1)} KB gzip (${own.map(([n]) => n).join(', ')})`,
  ).toBeLessThanOrEqual(BUDGET_BYTES);
  for (const [path] of take) expect(path, 'gói nặng bị tải ở khu làm bài').not.toMatch(FORBIDDEN);
});
