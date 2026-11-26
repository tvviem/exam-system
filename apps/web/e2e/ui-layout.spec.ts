import { expect, type Locator, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error('Không có khung hiển thị');
  return b;
};

// Bố cục: các khối cạnh nhau không được đè lên nhau (lỗi chủ dự án phát hiện: thanh lọc đè lên khối Chủ đề).
test('Ngân hàng câu hỏi (laptop): thanh tìm và lọc không đè lên cột Chủ đề, kể cả khi cuộn', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'cột Chủ đề chỉ có từ 1024 px');
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill('e2e-ch-rong-desktop');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/examiner/questions');

  const topics = page.locator('aside').getByRole('heading', { name: 'Chủ đề' });
  await expect(topics).toBeVisible();
  const aside = page.locator('aside > div').first();
  const bar = page.getByTestId('filter-bar');
  await expect(bar).toBeVisible();

  const a = await box(aside);
  const b = await box(bar);
  expect(b.x, 'thanh lọc phải nằm bên phải cột Chủ đề').toBeGreaterThanOrEqual(a.x + a.width);
});

// Quét bố cục: không phần tử tương tác hay tiêu đề nào bị phần tử khác che (đè), ở cả hai chế độ sáng/tối,
// bốn cỡ màn hình chuẩn, cả khi cuộn xuống (thanh dính). Bổ sung cho themes.spec.ts (chỉ kiểm cuộn ngang).
const ROUTES = {
  examiner: [
    '/examiner',
    '/examiner/questions',
    '/examiner/questions/new',
    '/examiner/questions/import',
    '/examiner/exams',
    '/examiner/sessions',
    '/examiner/sessions/new',
    '/examiner/account-requests',
    '/account',
  ],
  admin: [
    '/admin',
    '/admin/users',
    '/admin/units',
    '/admin/invitations',
    '/admin/account-requests',
    '/admin/grading-delegates',
    '/admin/login-events',
    '/admin/audit-logs',
    '/admin/backup',
    '/admin/mail-queue',
  ],
} as const;
const AUDIT_USER = { examiner: 'e2e-ch-rong', admin: 'e2e-giao-dien' } as const;

// Mỗi tài khoản chỉ đăng nhập MỘT lần mỗi worker rồi dùng lại cookie phiên: giới hạn đăng nhập (10 lần mỗi 10 phút cho một cặp
// tên đăng nhập và IP) sẽ chặn 8 lần đăng nhập liên tiếp của cùng một tài khoản khi cả bộ E2E chạy.
const sessions = new Map<
  string,
  Awaited<ReturnType<import('@playwright/test').BrowserContext['cookies']>>
>();
async function withSession(page: import('@playwright/test').Page, username: string) {
  const cached = sessions.get(username);
  if (cached) {
    await page.context().addCookies(cached);
    return;
  }
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  sessions.set(username, await page.context().cookies());
}

async function occluded(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const nodes = document.querySelectorAll(
      'h1,h2,h3,button,a[href],input,select,textarea,[role=tab],[role=checkbox]',
    );
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width < 4 || r.height < 4 || style.visibility === 'hidden' || style.display === 'none')
        continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      if (el.closest('[inert],[aria-hidden=true]')) continue;
      // Lấy điểm theo từng khung dòng: liên kết xuống hai dòng có khung bao chung trùm cả chữ đứng cạnh dòng thứ hai, dù
      // không hề đè nhau.
      const points = [...el.getClientRects()]
        .filter((line) => line.width >= 4 && line.height >= 4)
        .flatMap((line): [number, number][] => [
          [line.left + line.width / 2, line.top + line.height / 2],
          [line.left + 3, line.top + 3],
          [line.right - 3, line.top + 3],
          [line.left + 3, line.bottom - 3],
          [line.right - 3, line.bottom - 3],
        ]);
      for (const [x, y] of points) {
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const top = document.elementFromPoint(x, y);
        if (!top || top === el || el.contains(top) || top.contains(el)) continue;
        // Nhãn bao quanh ô nhập (label > input) và vùng bấm mở rộng là bình thường.
        if (el.closest('label')?.contains(top) || top.closest('label')?.contains(el)) continue;
        // Nội dung thường cuộn xuống dưới thanh đầu trang, thanh tab, thanh hành động dính: bình thường.
        // Chỉ báo khi chính phần tử cũng nằm trong khối dính (hai khối dính đè nhau, như lỗi Chủ đề).
        const pinned = (node: Element | null) => {
          for (let n = node; n; n = n.parentElement) {
            const position = getComputedStyle(n).position;
            // Cột đầu bảng dính trái (cuộn ngang) không phải khối dính theo trang.
            if (n.tagName === 'TD' || n.tagName === 'TH') continue;
            if (position === 'fixed' || position === 'sticky') return true;
          }
          return false;
        };
        if (pinned(top) && !pinned(el)) continue;
        found.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" bị che bởi ${top.tagName.toLowerCase()}.${String(top.className).slice(0, 60)}`,
        );
        break;
      }
    }
    return found;
  });
}

for (const role of ['examiner', 'admin'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`quét bố cục ${role}, chế độ ${scheme === 'light' ? 'sáng' : 'tối'}`, () => {
      test.use({ colorScheme: scheme });
      for (const width of [360, 768, 1024, 1440] as const) {
        test(`không phần tử nào bị che ở ${width} px`, async ({ page }, testInfo) => {
          test.setTimeout(120_000);
          await page.setViewportSize({ width, height: 800 });
          await withSession(page, `${AUDIT_USER[role]}-${testInfo.project.name}`);

          const problems: string[] = [];
          for (const path of ROUTES[role]) {
            await page.goto(path);
            await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
            await page.waitForLoadState('networkidle');
            for (const y of [0, 500]) {
              await page.evaluate((top) => window.scrollTo(0, top), y);
              for (const p of await occluded(page)) problems.push(`${path} (cuộn ${y}): ${p}`);
            }
          }
          expect(problems, problems.join('\n')).toEqual([]);
        });
      }
    });
  }
}
