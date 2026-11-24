import { expect, type Page, test } from '@playwright/test';
import { examinerPage, seedOpenSession, setViewMode, signIn } from './take-support';

// Bài rà trợ năng và bố cục chạy trên các trang chính (docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md, U6), để các lần chỉnh sau không làm
// giao diện xấu đi mà không ai biết. Mỗi trang phải: có đúng một h1; không nút hay liên kết nào thiếu tên; không tràn ngang; mọi thứ bấm
// được đủ lớn (điện thoại: 44 px; máy tính: 24 px, ngưỡng WCAG 2.2).

interface Violation {
  page: string;
  problem: string;
}

async function check(page: Page, name: string, minSide: number): Promise<Violation[]> {
  // Chờ có tiêu đề (nếu thiếu thì ghi lỗi bên dưới, không treo bài); rồi để mạng lặng một chút, tối đa 3 giây.
  await page
    .locator('h1')
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  const found = await page.evaluate((min) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const label = (el: Element) =>
      (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        (el as HTMLElement).textContent ||
        el.getAttribute('placeholder') ||
        ''
      )
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
    const interactive = Array.from(
      document.querySelectorAll(
        'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], [role=checkbox], [role=menuitem]',
      ),
    ).filter(visible);
    const out: string[] = [];
    const h1 = document.querySelectorAll('h1').length;
    if (h1 !== 1) out.push(`có ${h1} thẻ h1 (cần đúng 1)`);
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (overflow > 0) out.push(`tràn ngang ${overflow} px`);
    for (const el of interactive) {
      const named =
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        el.getAttribute('title') ||
        (el as HTMLElement).textContent?.trim() ||
        (el as HTMLInputElement).labels?.length ||
        el.querySelector('img[alt]:not([alt=""])');
      if (!named)
        out.push(
          `thiếu tên: <${el.tagName.toLowerCase()} class="${(el.getAttribute('class') ?? '').slice(0, 40)}">`,
        );
      const box = el.closest('label')?.getBoundingClientRect() ?? el.getBoundingClientRect();
      if (Math.min(box.width, box.height) < min) {
        out.push(
          `vùng bấm nhỏ (${Math.round(box.width)}x${Math.round(box.height)}): ${el.tagName.toLowerCase()} "${label(el)}"`,
        );
      }
    }
    return out;
  }, minSide);
  return found.map((problem) => ({ page: name, problem }));
}

test('Rà trợ năng và bố cục: các trang chính của Người ra đề', async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const minSide = p === 'mobile' ? 44 : 24;
  const examiner = await examinerPage(browser, `e2e-uxa-gv-${p}`);
  const sessionId = await seedOpenSession(examiner, `${p}-sweep`, `UXASW${tag}`, `UXA-${tag}-001`);
  const session = await (await examiner.request.get(`/api/sessions/${sessionId}`)).json();

  const pages: [string, string][] = [
    ['Phiên thi (danh sách)', '/examiner/sessions'],
    ['Tạo Phiên thi', '/examiner/sessions/new'],
    ['Phiên thi (chi tiết)', `/examiner/sessions/${sessionId}`],
    ['Kết quả', `/examiner/sessions/${sessionId}/results`],
    ['Chấm', `/examiner/sessions/${sessionId}/grading`],
    ['Phúc khảo', `/examiner/sessions/${sessionId}/appeals`],
    ['Ngân hàng câu hỏi', '/examiner/questions'],
    ['Soạn câu hỏi', '/examiner/questions/new'],
    ['Bộ đề (danh sách)', '/examiner/exams'],
    ['Bộ đề (đã phát hành)', `/examiner/exams/${session.examId}`],
    ['Yêu cầu cấp tài khoản', '/examiner/account-requests'],
    ['Tài khoản', '/account'],
  ];
  const violations: Violation[] = [];
  for (const [name, path] of pages) {
    await examiner.goto(path);
    violations.push(...(await check(examiner, name, minSide)));
  }
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
});

test('Rà trợ năng và bố cục: các màn của Người dự thi', async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const minSide = p === 'mobile' ? 44 : 24;
  const code = `UXASC${tag}`;
  const examiner = await examinerPage(browser, `e2e-uxa-gv-${p}`);
  await seedOpenSession(examiner, `${p}-sweepc`, code, `UXA-${tag}-001`);

  await signIn(page, `e2e-uxa-sv-${p}`);
  const violations: Violation[] = [];
  await page.goto('/take');
  violations.push(...(await check(page, 'Vào thi', minSide)));
  await page.getByLabel('Mã vào thi').fill(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).waitFor();
  violations.push(...(await check(page, 'Xác nhận vào thi', minSide)));
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);
  await setViewMode(page, 'Cả đề');
  violations.push(...(await check(page, 'Làm bài', minSide)));
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
});
