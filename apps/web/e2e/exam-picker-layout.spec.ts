import { expect, type Locator, type Page, test } from '@playwright/test';
import { escapeRegExp } from './topic-support';

// Hộp "Thêm câu hỏi vào Bộ đề": chỗ cho danh sách câu, ô chọn Chủ đề gõ để tìm, màn Bộ lọc trên điện thoại.
// Thiết kế: docs/plan/hop-chon-cau-thiet-ke.md.

const PASSWORD = 'mat-khau-on-dinh';
const ORIGIN = 'http://localhost:4173'; // server chặn yêu cầu ghi không có Origin
const SIZE = { desktop: { width: 1366, height: 768 }, mobile: { width: 390, height: 844 } };

const rich = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** 12 Chủ đề, một Chủ đề có 20 câu Phần dẫn dài, và một Bộ đề trống. Trả tên Chủ đề có câu và mã Bộ đề. */
async function seed(page: Page, tag: string) {
  const headers = { origin: ORIGIN };
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const name = `Cấu trúc dữ liệu ${tag}`;
  const topic = await post('/api/topics', { name });
  await post('/api/topics', { name: `Cơ sở dữ liệu ${tag}` });
  await Promise.all(
    Array.from({ length: 10 }, (_, k) =>
      post('/api/topics', { name: `Chuyên đề ${k + 1} ${tag}` }),
    ),
  );
  await Promise.all(
    Array.from({ length: 20 }, (_, k) =>
      post('/api/questions', {
        type: 'single_choice',
        topicId: topic.id,
        stem: rich(
          `Câu hộp ${String(k + 1).padStart(2, '0')}: Cho danh sách liên kết đơn gồm n phần tử, độ phức tạp của thao tác chèn một phần tử vào cuối danh sách khi chỉ giữ con trỏ đầu là bao nhiêu?`,
        ),
        defaultPoints: 1,
        tags: ['chương 2', 'thông hiểu'],
        payload: {
          options: [
            { id: 'o1', content: rich('a') },
            { id: 'o2', content: rich('b') },
          ],
          key: ['o1'],
          shuffleOptions: true,
        },
      }),
    ),
  );
  const exam = await post('/api/exams', { title: `Đề hộp ${tag}` });
  return { name, examId: exam.id as string };
}

async function openPicker(page: Page, project: string) {
  await signIn(page, `e2e-hop-${project}`);
  const tag = `${project[0]}${Date.now() % 1_000_000}`;
  const data = await seed(page, tag);
  await page.setViewportSize(SIZE[project as keyof typeof SIZE]);
  await page.goto(`/examiner/exams/${data.examId}`);
  const started = Date.now();
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
  await expect(dialog.getByRole('checkbox', { name: /^Chọn câu:/ }).first()).toBeVisible();
  console.log(`[đo] mở hộp tới khi thấy câu đầu: ${Date.now() - started} ms`);
  return { ...data, tag, dialog };
}

/** Số dòng câu hỏi thấy trọn, chân hộp, và những vùng đang cuộn trong hộp. */
const measure = (dialog: Locator) =>
  dialog.evaluate((root) => {
    const rect = (el: Element) => el.getBoundingClientRect();
    const list = root.querySelector('[data-testid="picker-list"]') as Element;
    const footer = root.querySelector('[data-testid="picker-footer"]') as Element;
    const view = rect(list);
    return {
      fully: [...list.querySelectorAll('li')].filter(
        (li) => rect(li).top >= view.top - 1 && rect(li).bottom <= view.bottom + 1,
      ).length,
      listUnderFooter: view.bottom > rect(footer).top + 1,
      gapUnderFooter: Math.round(rect(root).bottom - rect(footer).bottom),
      scrolling: [root, ...root.querySelectorAll('*')]
        .filter(
          (el) =>
            el.scrollHeight > el.clientHeight + 1 &&
            ['auto', 'scroll'].includes(getComputedStyle(el).overflowY),
        )
        .map((el) => el.getAttribute('data-testid') ?? el.tagName)
        .filter((id) => id !== 'picker-list' && id !== 'picker-filters'),
    };
  });

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('danh sách câu chiếm phần lớn hộp; chỉ danh sách cuộn; không gì lộ dưới chân hộp', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  const { dialog } = await openPicker(page, p);
  const result = await measure(dialog);
  console.log(`[đo] ${p}: thấy trọn ${result.fully} câu`);
  expect(result.fully).toBeGreaterThanOrEqual(p === 'desktop' ? 6 : 4);
  expect(result.listUnderFooter).toBe(false);
  expect(Math.abs(result.gapUnderFooter)).toBeLessThanOrEqual(1);
  expect(result.scrolling).toEqual([]);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/hop-${p}.png` });
  if (p === 'mobile') {
    // Màn hẹp đóng bằng nút ở đầu hộp, chân hộp chỉ còn số câu đã chọn và nút Thêm.
    await expect(dialog.getByRole('button', { name: 'Hủy' })).toHaveCount(0);
    await page.setViewportSize({ width: 360, height: 740 });
    expect(await overflow(page)).toBe(0);
    const wide = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(wide, 'hộp tràn ngang').toBe(0);
  }
});

test('ô Chủ đề: hiện vài mục đầu, gõ để tìm (cả chữ cái đầu), bàn phím, Esc chỉ đóng danh sách', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  const { dialog, name, tag } = await openPicker(page, p);
  if (p === 'mobile') await dialog.getByRole('button', { name: /^Bộ lọc/ }).click();
  const box = dialog.getByRole('combobox', { name: 'Chủ đề' });
  const list = dialog.getByRole('listbox', { name: 'Chủ đề' });
  const option = (label: string) =>
    list.getByRole('option', { name: new RegExp(`^${escapeRegExp(label)}, \\d+ câu$`) });
  await expect(box).toHaveValue('Mọi Chủ đề');
  await expect(list).toBeHidden();

  await box.click();
  await expect(list.getByRole('option')).toHaveCount(7); // Mọi Chủ đề + 6
  await expect(dialog.getByText(/^Còn \d+ Chủ đề khác\. Gõ tên để tìm\.$/)).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/chu-de-${p}.png` });

  await box.fill(`ctdl`);
  await expect(option(name)).toBeVisible();
  await expect(list.getByRole('option', { name: /^Cơ sở dữ liệu/ })).toHaveCount(0);

  await box.fill('zzz khong co');
  await expect(dialog.getByText('Không có Chủ đề khớp. Thử gõ ít từ hơn.')).toBeVisible();

  // Nhiều từ không dấu, Enter chọn kết quả đầu: danh sách đóng, câu được lọc.
  await box.fill(`cau truc ${tag}`);
  await box.press('Enter');
  await expect(list).toBeHidden();
  await expect(box).toHaveValue(name);

  // Mở lại bằng bàn phím: Chủ đề vừa chọn nằm ở nhóm dùng gần đây; Esc đóng danh sách, hộp vẫn mở.
  await box.press('ArrowDown');
  await expect(
    list.getByRole('group', { name: 'Dùng gần đây' }).getByRole('option').first(),
  ).toHaveAccessibleName(`${name}, 20 câu`);
  await box.press('Escape');
  await expect(list).toBeHidden();
  await expect(dialog).toBeVisible();

  // Gõ dở rồi rời ô: giữ lựa chọn cũ.
  await box.fill('co so');
  await box.press('Tab');
  await expect(list).toBeHidden();
  await expect(box).toHaveValue(name);

  // Chủ đề không có câu: danh sách trống; chọn lại "Mọi Chủ đề".
  await box.click();
  await box.fill(`co so ${tag}`);
  await option(`Cơ sở dữ liệu ${tag}`).click();
  if (p === 'mobile')
    await dialog.getByRole('button', { name: /^Xem 0 câu$|^Xem danh sách$/ }).click();
  await expect(dialog.getByText('Không có câu hỏi nào khớp.')).toBeVisible();
  await dialog.getByRole('button', { name: `Bỏ lọc: Cơ sở dữ liệu ${tag}` }).click();
  await expect(dialog.getByRole('checkbox', { name: /^Chọn câu:/ }).first()).toBeVisible();
});

test('điện thoại: màn Bộ lọc vào ra giữ lựa chọn; nhãn lọc gỡ được; Esc quay về danh sách', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'chỉ màn hẹp có màn Bộ lọc');
  const { dialog, name } = await openPicker(page, 'mobile');
  const first = dialog.getByRole('checkbox', { name: /^Chọn câu:/ }).first();
  const label = (await first.getAttribute('aria-label')) ?? '';
  await first.check();
  const filters = dialog.getByRole('button', { name: /^Bộ lọc/ });
  const list = dialog.getByTestId('picker-list');
  await expect(dialog.getByRole('combobox', { name: 'Chủ đề' })).toBeHidden();

  await filters.click();
  await expect(list).toBeHidden();
  const box = dialog.getByRole('combobox', { name: 'Chủ đề' });
  await box.click();
  await box.fill(name);
  await dialog.getByRole('option', { name: `${name}, 20 câu` }).tap();
  // Chạm chọn xong thì rời ô: bàn phím ảo không che nút "Xem … câu".
  await expect(box).not.toBeFocused();
  await dialog.getByLabel('Loại câu hỏi').selectOption('single_choice');
  await dialog.getByRole('button', { name: 'Xem 20 câu' }).click();
  await expect(list).toBeVisible();
  await expect(filters).toHaveAccessibleName('Bộ lọc (2)');
  await expect(dialog.getByRole('checkbox', { name: label })).toBeChecked();
  expect(await overflow(page)).toBe(0);

  await dialog.getByRole('button', { name: 'Bỏ lọc: Chọn một' }).click();
  await expect(filters).toHaveAccessibleName('Bộ lọc (1)');

  // Esc (phím Back của hộp) ở màn Bộ lọc chỉ quay về danh sách.
  await filters.click();
  await page.keyboard.press('Escape');
  await expect(list).toBeVisible();
  await expect(dialog).toBeVisible();

  await filters.click();
  await dialog.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await dialog.getByRole('button', { name: 'Quay lại danh sách' }).click();
  await expect(filters).toHaveAccessibleName('Bộ lọc');
  await expect(dialog.getByRole('checkbox', { name: label })).toBeChecked();
});
