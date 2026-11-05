import { type Browser, expect, type Locator, type Page } from '@playwright/test';
import { examinerPage, ORIGIN, seedOpenSession, signIn } from './take-support';

// Dùng chung cho các spec của màn Theo dõi (monitor.spec.ts, monitor-live.spec.ts).

const BEAT_MS = 15_000;

/**
 * Một phòng thi mở với hai Người dự thi. `prefix` chọn bộ người dùng E2E (mỗi spec một bộ, để không vượt giới hạn đăng
 * nhập); `fakeClock` cho trang Người dự thi đồng hồ giả để tua nhịp heartbeat 15 giây (tắt khi đo tin đẩy thật).
 */
export async function room(
  browser: Browser,
  project: string,
  tag: string,
  options: { prefix?: 'mon' | 'live' | 'xd' | 'ud' | 'gd'; fakeClock?: boolean } = {},
) {
  const prefix = options.prefix ?? 'mon';
  const fakeClock = options.fakeClock ?? true;
  const letter = project === 'desktop' ? 'D' : 'M';
  const code = `${prefix.toUpperCase()}${tag}${letter}`;
  const examiner = await examinerPage(browser, `e2e-lb-${prefix}-gv-${project}`);
  const sessionId = await seedOpenSession(
    examiner,
    `${project}-${tag}`,
    code,
    `${prefix.toUpperCase()}-${letter}-001`,
  );
  const added = await examiner.request.post(`/api/sessions/${sessionId}/roster`, {
    headers: { origin: ORIGIN },
    data: { codes: [`${prefix.toUpperCase()}-${letter}-002`] },
  });
  expect(added.ok(), await added.text()).toBe(true);

  /** `prepare` chạy trên trang trước khi đăng nhập (ví dụ chặn WebSocket để thử khi mất kênh đẩy). */
  const candidate = async (n: 1 | 2, prepare?: (page: Page) => Promise<void>) => {
    const context = await browser.newContext({ baseURL: ORIGIN });
    const page = await context.newPage();
    await prepare?.(page);
    if (fakeClock) await page.clock.install(); // tua được nhịp heartbeat
    await signIn(page, `e2e-lb-${prefix}-sv${n}-${project}`);
    await page.goto('/take');
    await page.getByLabel('Mã vào thi').fill(code);
    await page.getByRole('button', { name: 'Vào thi' }).click();
    await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
    await page.waitForURL(/\/take\/attempts\//);
    await expect(page.getByRole('timer', { name: 'Thời gian còn lại' })).toBeVisible();
    return page;
  };
  return { examiner, sessionId, code, letter, candidate };
}

/** Cho trang Người dự thi gửi nhịp kế tiếp ngay (tua 15 giây của đồng hồ giả). */
export const beat = (page: Page) => page.clock.fastForward(BEAT_MS + 100);

/**
 * Chờ một thông báo của Người ra đề hiện trên trang Người dự thi. Kênh đẩy thường báo trong chưa đến 1 giây; nếu chưa thấy thì
 * tua đồng hồ giả một nhịp heartbeat. Không tua khi đã thấy: thông báo Cộng giờ tự đóng sau 15 giây (Q282) nên tua đồng hồ giả sau
 * khi nó hiện sẽ làm nó biến mất.
 */
export async function awaitNotice(page: Page, notice: Locator) {
  try {
    await expect(notice).toBeVisible({ timeout: 2500 });
  } catch {
    await beat(page);
    await expect(notice).toBeVisible();
  }
}

export const openMonitor = async (examiner: Page, sessionId: string) => {
  const started = performance.now();
  await examiner.goto(`/examiner/sessions/${sessionId}?tab=monitor`);
  await expect(examiner.getByRole('heading', { name: 'Theo dõi phòng thi' })).toBeVisible();
  return performance.now() - started;
};

/** Mở ngăn chi tiết của một người (ngăn kéo ở máy tính, bottom sheet ở điện thoại). */
export async function openPerson(examiner: Page, name: RegExp) {
  await examiner.getByRole('button', { name }).first().click();
}
