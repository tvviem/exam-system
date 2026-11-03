import { expect, type Page, test } from '@playwright/test';
import { examinerPage, ORIGIN, overflow, seedOpenSession, signIn } from './take-support';

// S6b (phần ngoại tuyến) và S6e: tải lại lúc mất mạng vẫn làm tiếp được; thiết bị bị thu hồi (Q243, Q244).

/** Số bản ghi còn trong IndexedDB của khu làm bài: [bản sao đề, hàng đợi]. */
const localRecords = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<[number, number]>((resolve, reject) => {
        const open = indexedDB.open('exam-take');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['views', 'queues']);
          const views = tx.objectStore('views').count();
          const queues = tx.objectStore('queues').count();
          tx.oncomplete = () => resolve([views.result, queues.result]);
        };
      }),
  );

/** Service worker đã điều khiển trang và mọi file /assets trang đã tải đều nằm trong bộ nhớ đệm vỏ ứng dụng. */
const shellReady = (page: Page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return false;
    const name = (await caches.keys()).find((key) => key.startsWith('exam-shell-'));
    if (!name) return false;
    const cached = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    const loaded = performance
      .getEntriesByType('resource')
      .map((entry) => new URL(entry.name).pathname)
      .filter((path) => path.startsWith('/assets/'));
    return cached.includes('/') && loaded.every((path) => cached.includes(path));
  });

async function startAttempt(page: Page, username: string, code: string) {
  await signIn(page, username);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);
  await page.getByRole('button', { name: 'Cả đề' }).click();
}

test('Tải lại lúc mất mạng: mở đề từ máy, giữ câu trả lời, có mạng thì tự gửi (S6b)', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const code = `TKNG${tag}`;
  const examiner = await examinerPage(browser, `e2e-lb-gv-${p}`);
  await seedOpenSession(examiner, `${p}-ng`, code, `TK6-${tag}-001`);

  await startAttempt(page, `e2e-lb-ng-${p}`, code);
  const status = page.getByRole('status', { name: 'Trạng thái lưu' });
  await page.getByRole('radio', { name: 'Hà Nội' }).check();
  await expect(status).toContainText('Đã lưu');
  await expect.poll(() => shellReady(page), { timeout: 20_000 }).toBe(true);
  expect(await localRecords(page), 'đã giữ một bản sao đề trên máy').toEqual([1, 1]);

  // Mất mạng: làm tiếp, rồi tải lại trang
  await page.context().setOffline(true);
  await page.getByRole('checkbox', { name: 'hai' }).check();
  await page.getByRole('checkbox', { name: 'bảy' }).check();
  await page.getByRole('textbox', { name: 'Câu trả lời' }).fill('Viết khi mất mạng.');
  await page.getByRole('textbox', { name: 'Câu trả lời' }).blur();
  await expect(status).toContainText('Mất kết nối (2 câu chưa lưu)');
  await page.reload();

  await expect(page.getByText('Đang mở đề đã lưu trên máy')).toBeVisible();
  await expect(page.getByRole('timer')).toContainText(/^(29|28|30):\d\d$/);
  await expect(page.getByRole('radio', { name: 'Hà Nội' })).toBeChecked(); // đã lưu ở server trước đó
  await expect(page.getByRole('checkbox', { name: 'hai' })).toBeChecked(); // chỉ còn trên máy
  await expect(page.getByRole('checkbox', { name: 'bảy' })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Câu trả lời' })).toHaveValue(
    'Viết khi mất mạng.',
  );
  await expect(status).toContainText('Mất kết nối (2 câu chưa lưu)');
  expect(await overflow(page), 'màn làm bài ngoại tuyến').toBe(0);

  // Có mạng lại: tự gửi, thông báo ngoại tuyến biến mất
  await page.context().setOffline(false);
  await expect(status).toContainText('Đã lưu', { timeout: 20_000 });
  await expect(page.getByText('Đang mở đề đã lưu trên máy')).toBeHidden();

  // Server đã nhận đủ: tải lại trực tuyến vẫn thấy
  await page.reload();
  await expect(page.getByText('Đang mở đề đã lưu trên máy')).toBeHidden();
  await expect(page.getByRole('checkbox', { name: 'bảy' })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Câu trả lời' })).toHaveValue(
    'Viết khi mất mạng.',
  );

  // Nộp bài: không còn gì của Lượt này trên máy
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await page
    .getByRole('dialog', { name: 'Nộp bài?' })
    .getByRole('button', { name: 'Nộp bài' })
    .click();
  await expect(page.getByRole('heading', { name: 'Đã nộp' })).toBeVisible();
  await expect.poll(() => localRecords(page)).toEqual([0, 0]);
});

test('Thiết bị bị thu hồi: màn chiếm toàn bộ, câu chưa gửi vẫn giữ trên máy (S6e)', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const code = `TKTH${tag}`;
  const examiner = await examinerPage(browser, `e2e-lb-gv-${p}`);
  const sessionId = await seedOpenSession(examiner, `${p}-th`, code, `TK7-${tag}-001`);

  await startAttempt(page, `e2e-lb-th-${p}`, code);
  const status = page.getByRole('status', { name: 'Trạng thái lưu' });
  await page.getByRole('radio', { name: 'Hà Nội' }).check();
  await expect(status).toContainText('Đã lưu');

  // Người ra đề thu hồi thiết bị
  const roster = await examiner.request.get(`/api/sessions/${sessionId}/roster?q=TK7-${tag}-001`);
  const { userId } = (await roster.json()).items[0];
  const revoke = await examiner.request.post(
    `/api/sessions/${sessionId}/roster/${userId}/revoke-device`,
    { headers: { origin: ORIGIN }, data: { reason: 'Thu hồi thử' } },
  );
  expect(revoke.ok(), await revoke.text()).toBe(true);

  // Lần lưu kế tiếp bị từ chối: màn thu hồi chiếm toàn bộ, không còn nội dung đề
  await page.getByRole('checkbox', { name: 'bảy' }).check();
  await expect(page.getByRole('heading', { name: 'Thiết bị này đã bị thu hồi' })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(page.getByText(`Thủ đô của Việt Nam ${p}-th?`)).toBeHidden();
  await expect(page.getByRole('link', { name: 'Về danh sách Phiên thi' })).toBeVisible();
  expect(await overflow(page), 'màn thu hồi').toBe(0);

  // Câu vừa chọn chưa tới server: vẫn giữ trên máy để làm tiếp nếu Người ra đề hoàn tác Thu hồi
  const [, queues] = await localRecords(page);
  expect(queues).toBe(1);

  // Tải lại: vẫn là màn thu hồi
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Thiết bị này đã bị thu hồi' })).toBeVisible();
});

test('PWA: có manifest và service worker điều khiển trang', async ({ page }) => {
  await page.goto('/login');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({
    lang: 'vi',
    display: 'standalone',
    start_url: '/take',
    icons: expect.arrayContaining([expect.objectContaining({ sizes: '512x512' })]),
  });
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await expect.poll(() => shellReady(page), { timeout: 20_000 }).toBe(true);
  // Chỉ lưu đệm vỏ ứng dụng và ảnh đề: không có response API nào trong kho
  const cachedApi = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys())
        urls.push(new URL(request.url).pathname);
    }
    return urls.filter((path) => path.startsWith('/api/') && !path.startsWith('/api/take-media/'));
  });
  expect(cachedApi).toEqual([]);
});

/** Các mặt chữ KaTeX đã tải xong, đọc từ `document.fonts`. */
const loadedKatexFaces = (page: Page) =>
  page.evaluate(() =>
    [...document.fonts]
      .filter((face) => face.status === 'loaded' && face.family.includes('KaTeX'))
      .map((face) => face.family.replace(/["']/g, '')),
  );

test('Công thức ở câu chưa xem: phông KaTeX được tải trước, mất mạng rồi tải lại vẫn dựng đúng', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const code = `TKMT${tag}`;
  const examiner = await examinerPage(browser, `e2e-lb-gv-${p}`);
  // \mathbb cần phông AMS, mà câu 1 (đang hiện) không có công thức nào.
  await seedOpenSession(examiner, `${p}-mt`, code, `TK8-${tag}-001`, {
    essayLatex: String.raw`\int_0^1 \sqrt{x}\,dx \in \mathbb{R}`,
  });

  // Đặt "Từng câu" từ trước khi trang tải: màn rộng mặc định "Cả đề" sẽ vẽ mọi công thức ngay lúc mở.
  await page.addInitScript(() =>
    localStorage.setItem(
      'exam:prefs',
      JSON.stringify({ viewMode: 'one', fontScale: 100, serif: true }),
    ),
  );
  await signIn(page, `e2e-lb-mt-${p}`);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);

  await expect(page.getByText(`Thủ đô của Việt Nam ${p}-mt?`)).toBeVisible();
  await expect(page.locator('[data-math]')).toHaveCount(0); // chỉ câu 1 hiện: chưa có công thức nào được vẽ
  await expect.poll(() => loadedKatexFaces(page), { timeout: 20_000 }).toContain('KaTeX_AMS');
  await expect.poll(() => shellReady(page), { timeout: 20_000 }).toBe(true);

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('Đang mở đề đã lưu trên máy')).toBeVisible();
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await expect(page.locator('[data-math] .katex')).toBeVisible();
  await expect.poll(() => loadedKatexFaces(page)).toContain('KaTeX_AMS'); // lấy từ bộ nhớ đệm, không phải mạng
});
