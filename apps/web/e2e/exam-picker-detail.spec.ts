import { expect, type Page, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';

// Soạn Bộ đề: nút "Thêm câu hỏi" ở thanh dính (độc lập với các Phần) và hộp "Chi tiết câu hỏi" trong hộp "Thêm câu hỏi vào Bộ đề".
// Chạy trên cả desktop và mobile.

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
  await page.screenshot({ path: `${process.env.SHOTS}/bo-de-${name}.png` });
};

/**
 * Chủ đề riêng với bốn Loại câu (chọn một, chọn nhiều, chùm đúng/sai, tự luận có hướng dẫn chấm), kèm Bộ đề nháp hai Phần mỗi Phần
 * `perSection` câu (đủ dài để phải cuộn). Trả mã Bộ đề và tên Chủ đề.
 */
async function seed(page: Page, tag: string, perSection: number) {
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topicName = `Chi tiết ${tag}`;
  const topic = await post('/api/topics', { name: topicName });
  const common = { topicId: topic.id, tags: ['kiểm tra', 'tag-hai'] };
  const make = (stem: string) => ({
    ...common,
    type: 'single_choice',
    stem: rich(stem),
    defaultPoints: 1,
    payload: {
      options: [
        { id: 'o1', content: rich('Phương án sai') },
        { id: 'o2', content: rich('Phương án đúng') },
        { id: 'o3', content: rich('Phương án nhiễu') },
      ],
      key: ['o2'],
      shuffleOptions: false,
    },
  });
  // Bốn Loại câu để xem chi tiết.
  await post('/api/questions', {
    ...common,
    type: 'essay',
    stem: rich('Trình bày định nghĩa giới hạn'),
    defaultPoints: 3,
    payload: { maxLength: 1000, rubric: rich('Nêu đủ ε-δ') },
  });
  await post('/api/questions', {
    ...common,
    type: 'true_false_cluster',
    stem: rich('Xét hàm số bậc ba'),
    defaultPoints: 1,
    payload: {
      statements: [
        { id: 's1', content: rich('đồng biến trên R'), key: true },
        { id: 's2', content: rich('có cực trị'), key: false },
      ],
      scoringRule: 'ladder',
      ladder: [0, 0.25, 1],
    },
  });
  await post('/api/questions', {
    ...common,
    type: 'multiple_choice',
    stem: rich('Chọn các số nguyên tố'),
    defaultPoints: 2,
    payload: {
      options: [
        { id: 'o1', content: rich('hai') },
        { id: 'o2', content: rich('bốn') },
        { id: 'o3', content: rich('bảy') },
      ],
      key: ['o1', 'o3'],
      scoringRule: 'proportional',
      shuffleOptions: false,
    },
  });
  await post('/api/questions', make('Thủ đô của Việt Nam là gì?'));
  // Các câu của Bộ đề (khác Chủ đề để không lẫn vào danh sách của hộp).
  const fillerTopic = await post('/api/topics', { name: `Nền ${tag}` });
  const ids: string[] = [];
  for (let n = 1; n <= perSection * 2; n++) {
    const q = await post('/api/questions', {
      ...make(`Câu nền ${n}`),
      topicId: fillerTopic.id,
    });
    ids.push(q.id);
  }
  const exam = await post('/api/exams', { title: `Bộ đề chi tiết ${tag}` });
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: `Bộ đề chi tiết ${tag}`,
      instructions: rich(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: 'Phần I',
          instructions: rich(''),
          items: ids.slice(0, perSection).map((questionId) => ({ questionId, points: 1 })),
        },
        {
          title: 'Phần II',
          instructions: rich(''),
          items: ids.slice(perSection).map((questionId) => ({ questionId, points: 1 })),
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return { examId: exam.id as string, topicName };
}

const addButton = (page: Page) => page.getByRole('button', { name: 'Thêm câu hỏi', exact: true });
const pickerDialog = (page: Page) => page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
const detailDialog = (page: Page) => page.getByRole('dialog', { name: 'Chi tiết câu hỏi' });
const selectedDestination = (page: Page) =>
  pickerDialog(page).getByLabel('Thêm vào Phần').locator('option:checked');

test('Nút "Thêm câu hỏi" ở thanh dính: luôn thấy khi cuộn, không còn nút ở cuối từng Phần, đích mặc định là Phần đang xem', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-pcd-${p}`);
  const { examId, topicName } = await seed(
    page,
    `thanh-dinh-${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`,
    8,
  );
  await page.goto(`/examiner/exams/${examId}`);

  // Chỉ một nút "Thêm câu hỏi" (ở thanh dính), thấy ngay cả khi cuộn xuống cuối trang.
  await expect(addButton(page)).toHaveCount(1);
  await expect(addButton(page)).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(addButton(page)).toBeInViewport();
  await shot(page, `thanh-dinh-${p}`);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Đầu trang đang xem Phần I → mở hộp thì đích mặc định là Phần I.
  await page.evaluate(() => window.scrollTo(0, 0));
  await addButton(page).click();
  await expect(selectedDestination(page)).toContainText('Phần I');
  await expect(selectedDestination(page)).not.toContainText('Phần II');
  await pickerDialog(page).getByRole('button', { name: 'Hủy' }).click();
  await expect(pickerDialog(page)).toBeHidden();

  // Cuộn tới cuối (đang xem Phần II) → đích mặc định là Phần II; đổi sang Phần I ngay trong hộp; thêm câu vào Phần I.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await addButton(page).click();
  await expect(selectedDestination(page)).toContainText('Phần II');
  await pickerDialog(page).getByLabel('Thêm vào Phần').selectOption({ index: 0 });
  await pickerDialog(page).getByLabel('Chủ đề').selectOption({ label: topicName });
  await pickerDialog(page)
    .getByRole('checkbox', { name: /Thủ đô của Việt Nam/ })
    .check();
  await pickerDialog(page)
    .getByRole('button', { name: /^Thêm 1 câu vào Phần I/ })
    .click();
  await expect(pickerDialog(page)).toBeHidden();
  await expect(page.getByText('Thủ đô của Việt Nam là gì?').first()).toBeVisible();
  // Câu mới nằm trong Phần I (khối đầu tiên), không phải Phần II.
  await expect(page.locator('[id^="section-"][tabindex="-1"]').first()).toContainText(
    'Thủ đô của Việt Nam là gì?',
  );
  await expect(page.locator('[id^="section-"][tabindex="-1"]').nth(1)).not.toContainText(
    'Thủ đô của Việt Nam là gì?',
  );

  // Phần trống: có nút gợi ý riêng, mở hộp với đích là Phần đó.
  await page.getByRole('button', { name: 'Thêm Phần' }).click();
  const hint = page.getByRole('button', { name: 'Chọn câu hỏi cho Phần này' });
  await expect(hint).toBeVisible();
  await hint.click();
  await expect(selectedDestination(page)).toContainText('Phần 3');
});

test('Hộp "Chi tiết câu hỏi": đủ đề bài và phương án, đáp án đúng có dấu ✓ và chú thích, chọn ngay trong hộp, duyệt ‹ ›, Esc về hộp danh sách', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-pcd-${p}`);
  const { examId, topicName } = await seed(
    page,
    `chi-tiet-${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`,
    2,
  );
  await page.goto(`/examiner/exams/${examId}`);
  await addButton(page).click();
  const picker = pickerDialog(page);
  await picker.getByLabel('Chủ đề').selectOption({ label: topicName });
  await expect(picker.getByRole('checkbox', { name: /Thủ đô của Việt Nam/ })).toBeVisible();

  // Mở chi tiết câu chọn một: đề bài, ba phương án, đúng một đáp án có dấu ✓ kèm chú thích; thẻ và Chủ đề.
  await picker.getByRole('button', { name: /Xem chi tiết: Thủ đô của Việt Nam/ }).click();
  const detail = detailDialog(page);
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Thủ đô của Việt Nam là gì?')).toBeVisible();
  await expect(detail.getByText('Phương án sai')).toBeVisible();
  await expect(detail.getByText('Phương án nhiễu')).toBeVisible();
  const correct = detail.locator('li[data-correct]');
  await expect(correct).toHaveCount(1);
  await expect(correct).toContainText('Phương án đúng');
  await expect(correct).toHaveAttribute('title', 'Đáp án đúng'); // chú thích khi rê chuột
  await expect(correct.getByText('Đáp án đúng')).toBeAttached(); // chữ cho trình đọc màn hình
  await expect(detail.getByText('kiểm tra', { exact: true })).toBeVisible();
  await expect(detail.getByText(new RegExp(topicName))).toBeVisible();
  await shot(page, `chi-tiet-${p}`);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Duyệt ‹ › qua cả 4 câu của Chủ đề: nhãn "n/4"; ghi lại nội dung và số đáp án đúng của từng câu.
  const position = detail.getByText(/^\d+\/4$/);
  const seen: { text: string; correct: number }[] = [];
  for (let n = 1; n <= 4; n++) {
    await expect(position).toHaveText(`${n}/4`);
    await expect(detail.locator('article')).toBeVisible();
    seen.push({
      text: (await detail.locator('article').textContent()) ?? '',
      correct: await detail.locator('li[data-correct]').count(),
    });
    if (n < 4) await detail.getByRole('button', { name: 'Câu sau' }).click();
  }
  await expect(detail.getByRole('button', { name: 'Câu sau' })).toBeDisabled(); // biên cuối
  const find = (text: string) => seen.findIndex((entry) => entry.text.includes(text));
  // Chùm đúng/sai có Đúng/Sai từng mệnh đề; tự luận có hướng dẫn chấm; chọn nhiều có hai đáp án đúng.
  const cluster = seen[find('Xét hàm số bậc ba')];
  expect(cluster?.text).toContain('đồng biến trên R');
  expect(cluster?.text).toContain('Đúng');
  expect(cluster?.text).toContain('Sai');
  expect(seen[find('Trình bày định nghĩa giới hạn')]?.text).toContain('Nêu đủ ε-δ');
  const multiple = find('Chọn các số nguyên tố');
  expect(seen[multiple]?.correct).toBe(2);

  // Về đầu danh sách: nút Câu trước khóa ở biên đầu; rồi tới câu chọn nhiều.
  for (let n = 3; n >= 1; n--) {
    await detail.getByRole('button', { name: 'Câu trước' }).click();
    await expect(position).toHaveText(`${n}/4`);
  }
  await expect(detail.getByRole('button', { name: 'Câu trước' })).toBeDisabled();
  for (let n = 2; n <= multiple + 1; n++) {
    await detail.getByRole('button', { name: 'Câu sau' }).click();
    await expect(position).toHaveText(`${n}/4`);
  }
  await expect(detail.getByText('Chọn các số nguyên tố')).toBeVisible();

  // Chọn ngay trong hộp: nút đổi thành "Bỏ chọn", ô tick ở danh sách cập nhật, chân hộp đếm 1 câu.
  await detail.getByRole('button', { name: 'Chọn câu này' }).click();
  await expect(detail.getByRole('button', { name: 'Bỏ chọn' })).toBeVisible();
  await detail.getByRole('button', { name: 'Quay lại danh sách' }).click();
  await expect(detail).toBeHidden();
  await expect(picker.getByRole('checkbox', { name: /Chọn các số nguyên tố/ })).toBeChecked();
  await expect(picker.getByRole('button', { name: /^Thêm 1 câu vào/ })).toBeVisible();

  // Esc đóng hộp chi tiết, về hộp danh sách và giữ nguyên lựa chọn; Bỏ chọn trong hộp thì ô tick bỏ.
  await picker.getByRole('button', { name: /Xem chi tiết: Chọn các số nguyên tố/ }).click();
  await expect(detail.getByRole('button', { name: 'Bỏ chọn' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('checkbox', { name: /Chọn các số nguyên tố/ })).toBeChecked();
  await picker.getByRole('button', { name: /Xem chi tiết: Chọn các số nguyên tố/ }).click();
  await detail.getByRole('button', { name: 'Bỏ chọn' }).click();
  await detail.getByRole('button', { name: 'Quay lại danh sách' }).click();
  await expect(picker.getByRole('checkbox', { name: /Chọn các số nguyên tố/ })).not.toBeChecked();
});
