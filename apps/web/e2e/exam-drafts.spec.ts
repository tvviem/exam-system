import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';
const ORIGIN = 'http://localhost:4173'; // server chặn yêu cầu ghi không có Origin

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

const rich = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** Tạo Chủ đề và vài Câu hỏi qua API cho nhanh; trả id các câu theo thứ tự. */
async function seedQuestions(page: Page, topicName: string, stems: string[]) {
  const headers = { origin: ORIGIN };
  const topic = await page.request.post('/api/topics', { headers, data: { name: topicName } });
  expect(topic.ok(), await topic.text()).toBe(true);
  const topicId = (await topic.json()).id;
  const ids: string[] = [];
  for (const stem of stems) {
    const res = await page.request.post('/api/questions', {
      headers,
      data: {
        type: 'single_choice',
        topicId,
        stem: rich(stem),
        defaultPoints: 1,
        tags: [],
        payload: {
          options: [
            { id: 'o1', content: rich('a') },
            { id: 'o2', content: rich('b') },
          ],
          key: ['o1'],
          shuffleOptions: true,
        },
      },
    });
    expect(res.ok(), await res.text()).toBe(true);
    ids.push((await res.json()).id);
  }
  return ids;
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Tên các câu theo thứ tự hiện trên trang (mỗi hàng một dòng trích Phần dẫn). */
const orderOf = (page: Page) =>
  page
    .getByRole('listitem')
    .filter({ hasText: /^Câu \d+/ })
    .locator('span.line-clamp-2')
    .allTextContents();

async function pick(page: Page, section: string, stems: string[]) {
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
  for (const stem of stems)
    await dialog.getByRole('checkbox', { name: `Chọn câu: ${stem}` }).check();
  await dialog.getByRole('button', { name: `Thêm ${stems.length} câu vào ${section}` }).click();
}

test('soạn Bộ đề nháp: thêm câu, đặt điểm, chia Phần, sắp xếp bằng nút, lưu, mở lại', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-bd-${p}`);
  await seedQuestions(page, `Giải tích ${p}`, ['Đạo hàm', 'Tích phân', 'Giới hạn', 'Chuỗi số']);

  await page.goto('/examiner/exams');
  await expect(page.getByText('Chưa có Bộ đề nào.')).toBeVisible();
  expect(await overflow(page), 'danh sách trống').toBe(0);
  await page.getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await page.getByRole('dialog').getByLabel('Tên Bộ đề').fill('Giữa kỳ Giải tích');
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await expect(page.getByRole('heading', { name: 'Giữa kỳ Giải tích', level: 1 })).toBeVisible();

  // Bộ đề mới: một Phần mặc định, chưa hiện khối Phần; Lưu còn mờ vì chưa sửa gì.
  await expect(page.getByText('Phần này chưa có câu hỏi.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();

  await pick(page, 'Phần 1', ['Đạo hàm', 'Tích phân', 'Giới hạn']);
  await expect(page.getByText('3 câu · 3 điểm')).toBeVisible();
  expect(await orderOf(page)).toEqual(['Đạo hàm', 'Tích phân', 'Giới hạn']);

  // Đặt điểm: dùng dấu phẩy; điểm sai (0,07) khóa Lưu.
  const points = page.getByRole('textbox', { name: 'Điểm câu 1' });
  await points.fill('2,5');
  await expect(page.getByText('4.5 câu', { exact: false })).toHaveCount(0);
  await expect(
    page.getByText('3 câu · 4,5 điểm').or(page.getByText('3 câu · 4.5 điểm')),
  ).toBeVisible();
  await points.fill('0,07');
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  await points.fill('2,5');

  // Sắp xếp bằng nút Lên/Xuống.
  await page.getByRole('button', { name: 'Đưa câu 3 lên' }).click();
  expect(await orderOf(page)).toEqual(['Đạo hàm', 'Giới hạn', 'Tích phân']);
  await page.getByRole('button', { name: 'Đưa câu 1 xuống' }).click();
  expect(await orderOf(page)).toEqual(['Giới hạn', 'Đạo hàm', 'Tích phân']);

  // Chia Phần, đặt tiêu đề, chuyển một câu sang Phần 2, thêm câu mới vào Phần 2.
  await page.getByRole('button', { name: 'Chia Phần' }).click();
  await page.getByLabel('Tiêu đề Phần').first().fill('Phần I: Cơ bản');
  await page.getByLabel('Tiêu đề Phần').nth(1).fill('Phần II: Nâng cao');
  await page
    .getByRole('combobox', { name: 'Chuyển câu 3 sang Phần' })
    .selectOption({ label: 'Phần II: Nâng cao' });
  await expect(page.getByLabel('Tiêu đề Phần').first()).toHaveValue('Phần I: Cơ bản');
  expect(await orderOf(page)).toEqual(['Giới hạn', 'Đạo hàm', 'Tích phân']);
  await page.getByRole('button', { name: 'Thêm câu hỏi' }).nth(1).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
  // Câu đã có trong Bộ đề hiện "Đã có" và không tick được.
  await expect(dialog.getByRole('checkbox', { name: 'Chọn câu: Đạo hàm' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Chọn câu: Chuỗi số' }).check();
  await dialog.getByRole('button', { name: 'Thêm 1 câu vào Phần II: Nâng cao' }).click();
  expect(await orderOf(page)).toEqual(['Giới hạn', 'Đạo hàm', 'Tích phân', 'Chuỗi số']);
  expect(await overflow(page), 'trang soạn').toBe(0);

  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Bộ đề')).toBeVisible();

  // Mở lại: đúng Phần, thứ tự và điểm.
  await page.reload();
  await expect(page.getByLabel('Tiêu đề Phần').nth(1)).toHaveValue('Phần II: Nâng cao');
  expect(await orderOf(page)).toEqual(['Giới hạn', 'Đạo hàm', 'Tích phân', 'Chuỗi số']);
  await expect(page.getByRole('textbox', { name: 'Điểm câu 2' })).toHaveValue('2.5');

  // Ô điểm có nhãn "Điểm" nhìn thấy và chú thích khi rê chuột (title).
  await expect(page.getByRole('textbox', { name: 'Điểm câu 2' })).toHaveAttribute(
    'title',
    /Điểm của câu hỏi/,
  );

  // Đặt điểm nhanh: mỗi câu 0,25 cho cả Bộ đề; rồi chia đều tổng 10 điểm cho Phần II.
  await page.getByRole('button', { name: 'Đặt điểm nhanh' }).click();
  const quick = page.getByRole('dialog', { name: 'Đặt điểm nhanh' });
  await quick.getByLabel('Điểm mỗi câu').fill('0,25');
  await expect(quick.getByText('4 câu nhận 0,25 điểm; tổng 1 điểm.')).toBeVisible();
  await quick.getByLabel('Điểm mỗi câu').fill('0,07');
  await expect(quick.getByRole('button', { name: 'Áp dụng' })).toBeDisabled();
  await quick.getByLabel('Điểm mỗi câu').fill('0,25');
  expect(await overflow(page), 'hộp Đặt điểm nhanh').toBe(0);
  await quick.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(page.getByText('4 câu · 1 điểm')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Điểm câu 3' })).toHaveValue('0.25');

  await page.getByRole('button', { name: 'Đặt điểm nhanh' }).click();
  await quick.getByLabel('Áp dụng cho').selectOption('section');
  await quick.getByLabel('Phần', { exact: true }).selectOption({ label: 'Phần II: Nâng cao' });
  await quick.getByLabel('Cách đặt').selectOption('total');
  await quick.getByLabel('Tổng điểm cần chia').fill('1');
  await quick.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(page.getByRole('textbox', { name: 'Điểm câu 3' })).toHaveValue('0.5');
  await expect(page.getByRole('textbox', { name: 'Điểm câu 1' })).toHaveValue('0.25');
  await expect(
    page.getByText('4 câu · 1,5 điểm').or(page.getByText('4 câu · 1.5 điểm')),
  ).toBeVisible();

  // Xem thử: chỉ hiện bản đã lưu (báo còn thay đổi chưa lưu), không có Đáp án.
  await page.getByRole('tab', { name: 'Xem thử' }).click();
  await expect(page.getByText('Xem thử hiện bản đã lưu')).toBeVisible();
  const view = page.getByRole('region', { name: 'Nội dung xem thử' });
  await expect(view.getByRole('heading', { name: 'Phần II: Nâng cao' })).toBeVisible();
  await expect(view.getByText('Giới hạn').first()).toBeVisible();
  await expect(view.getByText('Đáp án đúng')).toHaveCount(0);
  await expect(view.getByText('Tỷ lệ')).toHaveCount(0);
  await page.getByLabel('Hiện cách tính điểm').check();
  await expect(view).toBeVisible();
  expect(await overflow(page), 'xem thử').toBe(0);
});

test('rời trang khi chưa lưu bị hỏi; lưu xong rồi rời thì không; danh sách tìm và lọc; xóa Bộ đề nháp', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await signIn(page, `e2e-bd-${p}`);
  const [q1] = await seedQuestions(page, `Đại số ${p}`, ['Ma trận', 'Định thức']);
  await page.goto('/examiner/exams');
  await page.getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await page.getByRole('dialog').getByLabel('Tên Bộ đề').fill('Kiểm tra Đại số');
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo Bộ đề' }).click();
  await pick(page, 'Phần 1', ['Ma trận']);

  // Chưa lưu: quay về danh sách bị hỏi (hộp thoại bị bỏ qua nên vẫn ở trang soạn).
  await page.getByRole('link', { name: 'Bộ đề', exact: true }).first().click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain('Có thay đổi chưa lưu');
  await expect(page.getByRole('heading', { name: 'Kiểm tra Đại số', level: 1 })).toBeVisible();

  // Lưu xong thì rời trang không bị hỏi.
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Bộ đề')).toBeVisible();
  await page.getByRole('link', { name: 'Bộ đề', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Tạo Bộ đề' })).toBeVisible();
  expect(dialogs).toHaveLength(1);

  // Danh sách: thẻ có số câu, trạng thái; tìm không dấu; lọc trạng thái.
  await expect(page.getByRole('link', { name: /Kiểm tra Đại số/ })).toContainText('Nháp');
  await expect(page.getByRole('link', { name: /Kiểm tra Đại số/ })).toContainText('1 câu · 1 điểm');
  await page.getByRole('searchbox', { name: 'Tìm Bộ đề' }).fill('dai so');
  await expect(page).toHaveURL(/q=dai/);
  await expect(page.getByRole('link', { name: /Kiểm tra Đại số/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Tìm Bộ đề' }).fill('khong co');
  await expect(page.getByText('Không có Bộ đề nào khớp.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Tìm Bộ đề' }).fill('');
  await page.getByRole('button', { name: 'Đã lưu trữ' }).click();
  await expect(page.getByText('Không có Bộ đề nào khớp.')).toBeVisible();
  expect(await overflow(page), 'danh sách').toBe(0);

  // Câu đang ở Bộ đề nháp thì không xóa được (Q166); gỡ rồi xóa Bộ đề.
  const blocked = await page.request.post('/api/questions/delete', {
    headers: { origin: ORIGIN },
    data: { ids: [q1] },
  });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).reason).toBe('QUESTION_IN_EXAM');

  await page.getByRole('button', { name: 'Nháp và Đã phát hành' }).click();
  await page.getByRole('link', { name: /Kiểm tra Đại số/ }).click();
  await page.getByRole('button', { name: 'Xóa Bộ đề' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa Bộ đề' }).click();
  await expect(page.getByRole('button', { name: 'Tạo Bộ đề' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Kiểm tra Đại số/ })).toHaveCount(0);
  const freed = await page.request.post('/api/questions/delete', {
    headers: { origin: ORIGIN },
    data: { ids: [q1] },
  });
  expect(freed.ok()).toBe(true);
});
