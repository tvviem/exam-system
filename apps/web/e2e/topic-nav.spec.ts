import { expect, type Locator, type Page, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';

// Cột Chủ đề của Ngân hàng câu hỏi khi có nhiều Chủ đề (docs/plan/chu-de-ux-thiet-ke.md, bài E-01 đến E-05): chữ không đè,
// thứ tự tự nhiên, gom nhóm, tìm, ô chọn chia nhóm. Máy tính dùng cột bên trái; điện thoại mở hộp "Chọn Chủ đề".

const LONG = 'Khái niệm cơ bản và ứng dụng thực tiễn nâng cao trong hệ thống';
const NAMES = [
  ...[1, 2, 3, 4, 5, 6].map((n) => `CTDL ${n} - Cấu trúc dữ liệu phần ${n}`),
  ...Array.from({ length: 12 }, (_, i) => `Cơ sở dữ liệu - Chương ${i + 1}: ${LONG}`),
  ...[4, 5, 6].map((n) => `NLS và ứng dụng AI - Chương ${n}: ${LONG}`),
  'Toán rời rạc',
  // Chủ đề lẻ tên dài nằm thẳng trong khung cuộn: đúng chỗ từng bị chữ đè khi dòng bị co lại.
  ...Array.from({ length: 12 }, (_, i) => `Chuyên đề riêng ${i + 1}: ${LONG} và các bài tập`),
];

const topicId: Record<string, Record<string, string>> = {};

/** Đăng nhập, tạo bộ Chủ đề mẫu (một lần cho mỗi tài khoản), mở Ngân hàng câu hỏi. */
async function openBank(page: Page, project: string) {
  await signIn(page, `e2e-nhom-${project}`);
  const existing = await (await page.request.get('/api/topics')).json();
  if (existing.length === 0) {
    for (const name of NAMES) {
      const res = await page.request.post('/api/topics', {
        headers: { origin: ORIGIN },
        data: { name },
      });
      expect(res.ok(), await res.text()).toBe(true);
    }
  }
  const all = await (await page.request.get('/api/topics')).json();
  topicId[project] = Object.fromEntries(
    all.map((t: { id: string; name: string }) => [t.name, t.id]),
  );
  await page.goto('/examiner/questions');
  await expect(page.getByRole('heading', { name: 'Ngân hàng câu hỏi' })).toBeVisible();
}

/** Vùng chọn Chủ đề: cột bên trái ở máy tính, hộp "Chọn Chủ đề" ở điện thoại. */
async function topicNav(page: Page, project: string) {
  if (project === 'mobile') {
    const dialog = page.getByRole('dialog', { name: 'Chọn Chủ đề' });
    if (!(await dialog.isVisible())) await page.getByRole('button', { name: /^Chủ đề:/ }).click();
    await expect(dialog).toBeVisible();
    return dialog.getByTestId('topic-nav');
  }
  return page.getByRole('complementary').getByTestId('topic-nav');
}

/** Tiêu đề nhóm: tên kèm số Chủ đề trong ngoặc (khác với dòng Chủ đề bắt đầu bằng "<nhóm> - "). */
const groupButton = (nav: Locator, name: string) =>
  nav.getByRole('button', { name: new RegExp(`^${name} \\(`) });

test.describe.configure({ mode: 'serial' });

test('E-01, E-02: chữ không đè lên nhau, trong nhóm xếp theo thứ tự tự nhiên', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await openBank(page, p);
  const nav = await topicNav(page, p);
  // Chỉ đo trong danh sách: dòng "Tất cả" và ô tìm đứng yên ngoài vùng cuộn.
  const checkRows = async (step: string, atLeast: number) => {
    const rows = await nav
      .getByTestId('topic-list')
      .locator('button')
      .evaluateAll((buttons) =>
        buttons.map((el) => {
          const box = el.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, spill: el.scrollHeight - el.clientHeight };
        }),
      );
    expect(rows.length, step).toBeGreaterThanOrEqual(atLeast);
    expect(rows.filter((r) => r.spill > 1).length, `${step}: dòng có chữ tràn khỏi ô`).toBe(0);
    const overlaps = rows.filter((r, i) => i > 0 && r.top < (rows[i - 1]?.bottom ?? 0) - 1);
    expect(overlaps.length, `${step}: dòng đè lên dòng trên`).toBe(0);
  };
  await expect(nav.getByRole('button', { name: /^Chuyên đề riêng 12:/ })).toBeVisible();
  await checkRows('nhóm đóng', 16);
  for (const group of ['CTDL', 'Cơ sở dữ liệu', 'NLS và ứng dụng AI']) {
    await groupButton(nav, group).click();
  }
  await expect(nav.getByRole('button', { name: /Chương 12:/ })).toBeVisible();
  await checkRows('nhóm mở', 36);

  const chapters = await nav
    .getByRole('button', { name: /^Cơ sở dữ liệu - Chương/ })
    .evaluateAll((els) =>
      els.map((el) => Number(/Chương (\d+)/.exec(el.getAttribute('aria-label') ?? '')?.[1])),
    );
  expect(chapters).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  // Trong nhóm chỉ hiện phần tên còn lại; tên đầy đủ vẫn đọc được.
  const ctdl = nav.getByRole('button', { name: /^CTDL 2 - / });
  await expect(ctdl).toContainText('2 - Cấu trúc dữ liệu phần 2');
  await expect(ctdl).not.toContainText('CTDL');
  await expect(ctdl).toHaveAttribute('title', 'CTDL 2 - Cấu trúc dữ liệu phần 2');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('E-03: nhóm mở đóng bằng bàn phím; chọn Chủ đề lọc và giữ trên địa chỉ; nhóm đang chọn tự mở', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await openBank(page, p);
  let nav = await topicNav(page, p);
  const group = groupButton(nav, 'NLS và ứng dụng AI');
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await group.focus();
  await page.keyboard.press('Enter');
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await nav.getByRole('button', { name: /Chương 5:/ }).click();
  const id = topicId[p]?.[`NLS và ứng dụng AI - Chương 5: ${LONG}`] as string;
  await expect(page).toHaveURL(new RegExp(`topicId=${id}`));

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ngân hàng câu hỏi' })).toBeVisible();
  nav = await topicNav(page, p);
  await expect(nav.getByRole('button', { name: /Chương 5:/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const open = groupButton(nav, 'NLS và ứng dụng AI');
  await open.click();
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('button', { name: /Chương 5:/ })).toHaveCount(0);
  await nav.getByRole('button', { name: /^Tất cả Chủ đề/ }).click();
  await expect(page).not.toHaveURL(/topicId=/);
});

test('E-04: tìm nhiều từ không dấu mở nhóm khớp; Enter chọn; Escape xóa; không có thì gợi ý', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await openBank(page, p);
  const nav = await topicNav(page, p);
  const box = nav.getByLabel('Tìm Chủ đề');
  await box.fill('11 co so');
  await expect(nav.getByRole('status')).toHaveText('1 Chủ đề khớp');
  await expect(nav.locator('button[aria-pressed]')).toHaveCount(2); // "Tất cả" và Chủ đề khớp
  await expect(nav.getByRole('button', { name: /Chương 11:/ })).toBeVisible();
  await box.press('Escape');
  await expect(box).toHaveValue('');
  await expect(nav.getByRole('status')).toHaveCount(0);

  await box.fill('khong co dau');
  await expect(nav.getByText('Không có Chủ đề nào khớp')).toBeVisible();
  await expect(nav.getByText('Thử gõ ít từ hơn')).toBeVisible();

  await box.fill('cau truc 4');
  await box.press('Enter');
  const id = topicId[p]?.['CTDL 4 - Cấu trúc dữ liệu phần 4'] as string;
  await expect(page).toHaveURL(new RegExp(`topicId=${id}`));
  if (p === 'mobile') {
    await expect(page.getByRole('dialog', { name: 'Chọn Chủ đề' })).toBeHidden();
    await expect(page.getByRole('button', { name: /^Chủ đề: CTDL 4 - / })).toBeVisible();
  }
});

test('E-05: ô chọn Chủ đề chia nhóm theo thứ tự tự nhiên, chọn theo tên đầy đủ vẫn đúng', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await openBank(page, p);
  const check = async () => {
    const select = page.getByLabel('Chủ đề', { exact: true });
    await expect(select).toBeVisible();
    await expect(select.locator('optgroup')).toHaveCount(3);
    expect(
      await select
        .locator('optgroup')
        .evaluateAll((groups) => groups.map((g) => (g as HTMLOptGroupElement).label)),
    ).toEqual(['Cơ sở dữ liệu', 'CTDL', 'NLS và ứng dụng AI']);
    const first = await select.locator('optgroup').first().locator('option').allTextContents();
    expect(first.slice(0, 3).map((t) => /Chương (\d+)/.exec(t)?.[1])).toEqual(['1', '2', '3']);
    await select.selectOption({ label: 'CTDL 3 - Cấu trúc dữ liệu phần 3' });
    await expect(select).toHaveValue(topicId[p]?.['CTDL 3 - Cấu trúc dữ liệu phần 3'] as string);
  };
  await page.goto('/examiner/questions/new?type=single_choice');
  await check();
  await page.goto('/examiner/questions/import');
  await check();
});
