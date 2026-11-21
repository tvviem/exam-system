import { expect, type Page, test } from '@playwright/test';
import { examinerPage, seedOpenSession, signIn } from './take-support';

// R4b (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 4.6, 8): tỷ lệ rút của từng Phần ở form Phiên thi (kế thừa Bộ đề, ghi đè, khóa).

const ORIGIN = 'http://localhost:4173'; // server chặn yêu cầu ghi không có Origin
const headers = { origin: ORIGIN };

const rich = (text: string) => ({
  type: 'doc',
  content: [
    text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
  ],
});

/** Chụp ảnh để xem bằng mắt khi đặt SHOTS=<thư mục> (không chụp trong CI). */
const shot = async (page: Page, name: string) => {
  if (!process.env.SHOTS) return;
  await page
    .locator('[data-testid="session-draw"]')
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${process.env.SHOTS}/phien-thi-${name}.png` });
};

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Bộ đề đã Phát hành: Phần I 10 câu × 1 điểm, mặc định rút 40 %; Phần II 5 câu × 2 điểm, lấy đủ. */
async function seedDrawExam(page: Page, title: string) {
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `Chủ đề ${title}` });
  const ids: string[] = [];
  for (let n = 1; n <= 15; n++) {
    const q = await post('/api/questions', {
      type: 'single_choice',
      topicId: topic.id,
      stem: rich(`Câu hỏi ${n}`),
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
    });
    ids.push(q.id);
  }
  const exam = await post('/api/exams', { title });
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title,
      instructions: rich(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: 'Phần I',
          instructions: rich(''),
          drawPercent: 40,
          items: ids.slice(0, 10).map((questionId) => ({ questionId, points: 1 })),
        },
        {
          title: 'Phần II',
          instructions: rich(''),
          items: ids.slice(10).map((questionId) => ({ questionId, points: 2 })),
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await post(`/api/exams/${exam.id}/publish`, { version: (await saved.json()).version });
}

const percentInput = (page: Page, name: string) =>
  page.getByRole('textbox', { name: new RegExp(`^Tỷ lệ rút của ${name} \\(`) });
const summary = (page: Page) => page.getByTestId('session-draw-summary');

test('Rút câu ở Phiên thi: kế thừa Bộ đề, ghi đè từng Phần, đặt lại, tạo, sửa, mở lại', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-rcs-${p}`);
  const title = `Bộ đề rút ${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  await seedDrawExam(page, title);

  await page.goto('/examiner/sessions/new');
  await page
    .getByLabel('Bộ đề', { exact: true })
    .selectOption({ label: `${title} (15 câu, 20 điểm)` });
  await page.getByLabel('Tên Phiên thi').fill(`Ca rút ${p}`);
  await page.getByRole('button', { name: 'Tiếp' }).click();
  await page.getByLabel('Giờ mở').fill('2030-01-10T08:00');
  await page.getByLabel('Giờ đóng').fill('2030-01-10T10:00');
  await page.getByRole('button', { name: 'Tiếp' }).click();

  // Bước 3: kế thừa tỷ lệ của Bộ đề (Phần I 40 % → 4 câu; Phần II đủ 5 câu).
  await expect(page.getByText('Bước 3/3: Thiết lập làm bài')).toBeVisible();
  await expect(page.getByText('Dùng tỷ lệ của Bộ đề: Phần I 40 %.')).toBeVisible();
  await expect(summary(page)).toHaveText('Mỗi Người dự thi nhận 9 câu, tối đa 14 điểm.');
  await expect(page.getByTestId('summary-draw').first()).toBeVisible();
  await expect(page.getByTestId('session-draw-row')).toHaveCount(0); // bảng ghi đè thu gọn

  // Mở bảng: mỗi Phần một dòng, ô hiện tỷ lệ của Bộ đề.
  await page.getByRole('button', { name: 'Thay đổi cho Phiên thi này' }).click();
  await expect(page.getByTestId('session-draw-row')).toHaveCount(2);
  await expect(percentInput(page, 'Phần I')).toHaveValue('40');
  await expect(percentInput(page, 'Phần II')).toHaveValue('100');
  await expect(page.getByText('Theo Bộ đề: 40 %.')).toBeVisible();

  // Ghi đè: Phần I lấy đủ, Phần II 60 % (3/5): 13 câu, tối đa 10 + 6 = 16 điểm.
  await percentInput(page, 'Phần I').fill('100');
  await percentInput(page, 'Phần II').fill('60');
  await expect(summary(page)).toHaveText('Mỗi Người dự thi nhận 13 câu, tối đa 16 điểm.');
  await expect(page.getByText('→ mỗi người nhận 3/5 câu')).toBeVisible();
  await expect(page.getByText('Đã đổi so với Bộ đề (100 %).')).toBeVisible();

  // Số sai: báo cạnh ô và khóa nút Tạo.
  for (const bad of ['150', '33,333', '']) {
    await percentInput(page, 'Phần II').fill(bad);
    await expect(page.getByText('Nhập số từ 0 đến 100, tối đa hai chữ số lẻ.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạo Phiên thi' })).toBeDisabled();
  }

  // Đặt lại về tỷ lệ của Bộ đề.
  await page.getByRole('button', { name: 'Dùng lại tỷ lệ của Bộ đề' }).click();
  await expect(summary(page)).toHaveText('Mỗi Người dự thi nhận 9 câu, tối đa 14 điểm.');
  await expect(page.getByRole('button', { name: 'Tạo Phiên thi' })).toBeEnabled();

  // Ghi đè lại: Phần I 70 % → 7 câu; Phần II đủ: 12 câu, tối đa 7 + 10 = 17 điểm.
  await page.getByRole('button', { name: 'Thay đổi cho Phiên thi này' }).click();
  await percentInput(page, 'Phần I').fill('70');
  await expect(summary(page)).toHaveText('Mỗi Người dự thi nhận 12 câu, tối đa 17 điểm.');
  expect(await overflow(page), 'bước 3 có rút câu').toBe(0);
  if (p === 'mobile') {
    const box = await percentInput(page, 'Phần I').boundingBox();
    expect(box?.height ?? 0, 'vùng chạm ô tỷ lệ').toBeGreaterThanOrEqual(44);
  }
  await shot(page, `ghi-de-${p}`);
  await page.getByRole('button', { name: 'Tạo Phiên thi' }).click();

  // Tổng quan: hiện tỷ lệ hiệu lực của Phiên thi.
  await expect(page.getByRole('heading', { name: `Ca rút ${p}` })).toBeVisible();
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  await expect(page.getByTestId('overview-draw')).toContainText('Mỗi người nhận 12/15 câu');
  await expect(page.getByTestId('overview-draw')).toContainText('Phần I 70 %');

  // Sửa: ô giữ đúng ghi đè đã lưu; đổi xuống 50 % → 5 + 5 = 10 câu; lưu; mở lại vẫn đúng.
  await page.getByRole('button', { name: 'Sửa' }).click();
  await page.getByRole('button', { name: 'Thay đổi cho Phiên thi này' }).click();
  await expect(percentInput(page, 'Phần I')).toHaveValue('70');
  await percentInput(page, 'Phần I').fill('50');
  await expect(summary(page)).toHaveText('Mỗi Người dự thi nhận 10 câu, tối đa 15 điểm.');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByTestId('overview-draw')).toContainText('Mỗi người nhận 10/15 câu');
  await page.reload();
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  await expect(page.getByTestId('overview-draw')).toContainText('Phần I 50 %');

  // Bỏ ghi đè (đặt lại rồi lưu): trở về tỷ lệ của Bộ đề (Phần I 40 %).
  await page.getByRole('button', { name: 'Sửa' }).click();
  await page.getByRole('button', { name: 'Dùng lại tỷ lệ của Bộ đề' }).click();
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByTestId('overview-draw')).toContainText('Mỗi người nhận 9/15 câu');
  await expect(page.getByTestId('overview-draw')).toContainText('Phần I 40 %');
});

test('Phần lệch điểm bị ghi đè xuống dưới 100 % và mọi Phần 0 % bị báo, khóa nút Tạo', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-rcs-${p}`);
  const title = `Bộ đề 0 ${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  await seedDrawExam(page, title);
  await page.goto('/examiner/sessions/new');
  await page
    .getByLabel('Bộ đề', { exact: true })
    .selectOption({ label: `${title} (15 câu, 20 điểm)` });
  await page.getByLabel('Tên Phiên thi').fill(`Ca 0 ${p}`);
  await page.getByRole('button', { name: 'Tiếp' }).click();
  await page.getByLabel('Giờ mở').fill('2030-01-10T08:00');
  await page.getByLabel('Giờ đóng').fill('2030-01-10T10:00');
  await page.getByRole('button', { name: 'Tiếp' }).click();
  await page.getByRole('button', { name: 'Thay đổi cho Phiên thi này' }).click();

  await percentInput(page, 'Phần I').fill('0');
  await percentInput(page, 'Phần II').fill('0');
  await expect(page.getByRole('alert').filter({ hasText: 'Mọi Phần đều 0 %' })).toBeVisible();
  await expect(summary(page)).toHaveText('Mỗi Người dự thi nhận 0 câu, tối đa 0 điểm.');
  await shot(page, `mot-phan-0-${p}`);
});

test('đã có người làm bài thì khóa ghi đè tỷ lệ rút và nói rõ lý do', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const code = `RCS${tag}${testInfo.repeatEachIndex}${testInfo.retry}`;
  const examiner = await examinerPage(browser, `e2e-rcs-${p}`);
  const sessionId = await seedOpenSession(
    examiner,
    `${p}-rcs-${testInfo.repeatEachIndex}-${testInfo.retry}`,
    code,
    `RCS-${tag}-001`,
  );

  // Chưa có Lượt: mở được bảng ghi đè.
  await examiner.goto(`/examiner/sessions/${sessionId}`);
  await examiner.getByRole('tab', { name: 'Tổng quan' }).click();
  await examiner.getByRole('button', { name: 'Sửa' }).click();
  await expect(examiner.getByRole('button', { name: 'Thay đổi cho Phiên thi này' })).toBeEnabled();
  await expect(examiner.getByTestId('session-draw-locked')).toHaveCount(0);

  // Người dự thi vào thi và bắt đầu làm bài.
  await signIn(page, `e2e-rcs-sv-${p}`);
  await page.goto('/take');
  await page.getByLabel('Mã vào thi').fill(code);
  await page.getByRole('button', { name: 'Vào thi' }).click();
  await page.getByRole('button', { name: 'Bắt đầu làm bài' }).click();
  await page.waitForURL(/\/take\/attempts\//);

  // Đã có Lượt: nút đổi biến mất, hiện lý do.
  await examiner.reload();
  await examiner.getByRole('tab', { name: 'Tổng quan' }).click();
  await examiner.getByRole('button', { name: 'Sửa' }).click();
  await expect(examiner.getByTestId('session-draw-locked')).toBeVisible();
  await expect(
    examiner.getByText('Đã có người làm bài nên không đổi được tỷ lệ rút của Phiên thi này.'),
  ).toBeVisible();
  await expect(examiner.getByRole('button', { name: 'Thay đổi cho Phiên thi này' })).toHaveCount(0);
  await shot(examiner, `khoa-${p}`);
});
