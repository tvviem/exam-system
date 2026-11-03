// PROTOTYPE (Q207, Q252–Q254): chụp màn Theo dõi gộp ở điện thoại và máy tính, đo thời gian thao tác, đi hết luồng chọn nhóm.
// Chạy: PROTO_OUT=<thư mục> pnpm --filter @exam/web exec playwright test prototype-theo-doi
import { expect, type Page, test } from '@playwright/test';
import { signIn } from './take-support';

const OUT = process.env.PROTO_OUT ?? 'test-results/proto';
const URL = '/examiner/sessions/theo-doi-thu';

async function timed(label: string, kind: string, run: () => Promise<unknown>) {
  const t0 = Date.now();
  await run();
  console.log(`[${kind}] ${label}: ${Date.now() - t0} ms`);
}

const pressedView = (page: Page) =>
  page.getByRole('group', { name: 'Chế độ xem' }).locator('[aria-pressed="true"]');

test('màn Theo dõi gộp', async ({ page }, info) => {
  const kind = info.project.name;
  test.slow();
  await signIn(page, `e2e-lc-gv-${kind}`);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${kind}-${name}.png` });
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  // 1. Chế độ mặc định theo mật độ (Q253).
  for (const [n, expected] of [
    [20, 'Thẻ'],
    [120, 'Bảng'],
    [300, 'Lưới'],
  ] as const) {
    await timed(`n=${n} mở trang`, kind, async () => {
      await page.goto(`${URL}?n=${n}`);
      await expect(page.getByRole('heading', { name: 'Theo dõi phòng thi' })).toBeVisible();
      await expect(page.getByText(`/ ${n} người`)).toBeVisible();
    });
    await expect(pressedView(page)).toHaveText(expected);
    expect(await overflow()).toBe(0);
    await shot(`n${n}-mac-dinh`);
  }

  // 2. Đổi chế độ xem ở 300 người.
  await timed('đổi sang Bảng', kind, async () => {
    await page.getByRole('button', { name: 'Bảng' }).click();
    await expect(pressedView(page)).toHaveText('Bảng');
  });
  await shot('n300-bang');
  await page.getByRole('button', { name: 'Thẻ' }).click();
  await shot('n300-the');

  // 3. Lọc "Cần chú ý", chọn nhóm, Cộng giờ cho nhóm.
  await page.goto(`${URL}?n=120`);
  await timed('lọc Cần chú ý', kind, async () => {
    await page.getByRole('button', { name: /^Cần chú ý/ }).click();
    await expect(page.getByRole('button', { name: /^Cần chú ý/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  await page.getByRole('button', { name: 'Chọn nhiều' }).click();
  await timed('chọn cả nhóm đang hiện', kind, async () => {
    await page.getByRole('button', { name: /^Chọn cả \d+ người đang hiện/ }).click();
    await expect(page.getByText(/Đã chọn \d+ người/)).toBeVisible();
  });
  await shot('nhom-da-chon');
  await page.getByRole('button', { name: 'Cộng giờ…' }).click();
  await page.getByLabel('Lý do (bắt buộc)').fill('Mất điện phòng máy');
  await shot('nhom-cong-gio');
  await timed('xác nhận Cộng giờ nhóm', kind, async () => {
    await page.getByRole('button', { name: /^Cộng 5 phút cho \d+ người/ }).click();
    await expect(page.getByText(/Đã cộng 5 phút cho \d+ người/)).toBeVisible();
  });
  await page.getByRole('button', { name: 'Buộc nộp…' }).click();
  await expect(page.getByText(/sẽ nộp bài ngay/)).toBeVisible();
  await shot('nhom-buoc-nop');
  await page.getByRole('button', { name: 'Hủy' }).click();
  await page.getByRole('button', { name: 'Xong chọn' }).click();

  // 4. Thao tác cả phòng.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300); // RowMenu tự đóng khi trang cuộn; chờ trang yên trước khi mở
  await page.getByRole('button', { name: 'Thao tác cả phòng' }).click();
  await page.getByRole('menuitem', { name: 'Buộc nộp cả phòng…' }).click();
  await expect(page.getByText('Cả phòng:')).toBeVisible();
  await shot('ca-phong-buoc-nop');
  await page.getByRole('button', { name: 'Hủy' }).click();

  // 5. Một người: ngăn kéo, Đình chỉ có xác nhận.
  await page.getByRole('button', { name: /SV26/ }).first().click();
  await timed('mở chi tiết một người', kind, async () => {
    await expect(page.getByRole('button', { name: 'Đình chỉ…' })).toBeVisible();
  });
  await shot('mot-nguoi');
  await page.getByRole('button', { name: 'Đình chỉ…' }).click();
  await expect(page.getByText('Đình chỉ chỉ áp dụng cho từng người')).toBeVisible();
  await shot('mot-nguoi-dinh-chi');
  await page.getByRole('button', { name: 'Hủy' }).click();

  expect(errors).toEqual([]);
});
