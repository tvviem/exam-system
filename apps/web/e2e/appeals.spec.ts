import { expect, test } from '@playwright/test';
import { examinerPage, ORIGIN, seedOpenSession, signIn } from './take-support';

// Phúc khảo hai phía (PR 5d-2; Q300, Q311–Q315). Bộ đề của `seedOpenSession`: chọn một (1 điểm, đáp án o1), chọn nhiều (2),
// chùm (1), tự luận (5). Người dự thi chọn sai câu chọn một (o2), làm đúng hai câu trắc nghiệm còn lại và được 5/5 tự luận: 8/9.
// Phúc khảo câu chọn một, Người ra đề đặt tối đa (1 điểm): 9/9.

const headers = { origin: ORIGIN };

test('Người dự thi gửi Phúc khảo, Người ra đề xử lý và gia hạn, Người dự thi thấy câu trả lời', async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const L = project === 'desktop' ? 'D' : 'M';
  const code = `APL${L}${Date.now() % 100000}`;
  const examiner = await examinerPage(browser, `e2e-lb-ap-gv-${project}`);
  const sessionId = await seedOpenSession(examiner, `ap-${project}`, code, `AP-${L}-001`);

  const context = await browser.newContext({ baseURL: ORIGIN });
  const page = await context.newPage();
  await signIn(page, `e2e-lb-ap-sv-${project}`);
  expect((await page.request.post('/api/take/join', { headers, data: { code } })).ok()).toBe(true);
  const start = await (
    await page.request.post(`/api/take/sessions/${sessionId}/start`, { headers, data: {} })
  ).json();
  const view = await (await page.request.get(`/api/take/attempts/${start.attempt.id}`)).json();
  const id = (type: string) =>
    view.sections[0].items.find((i: { type: string }) => i.type === type).itemId;
  const saved = await page.request.put(`/api/take/attempts/${start.attempt.id}/responses`, {
    headers,
    data: {
      items: [
        { itemId: id('single_choice'), value: { optionId: 'o2' }, clientSeq: 1 },
        { itemId: id('multiple_choice'), value: { optionIds: ['o1', 'o3'] }, clientSeq: 1 },
        {
          itemId: id('true_false_cluster'),
          value: { answers: { s1: true, s2: false } },
          clientSeq: 1,
        },
        { itemId: id('essay'), value: { text: 'Bài tự luận' }, clientSeq: 1 },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await page.request.post(`/api/take/attempts/${start.attempt.id}/submit`, { headers, data: {} });

  const call = async (method: 'put' | 'post', url: string, data: unknown) => {
    const res = await examiner.request[method](`/api/sessions/${sessionId}${url}`, {
      headers,
      data,
    });
    expect(res.ok(), await res.text()).toBe(true);
  };
  await call('post', '/close-entry', {});
  const grading = await (
    await examiner.request.get(`/api/sessions/${sessionId}/grading/items`)
  ).json();
  await call('put', `/grading/attempts/${start.attempt.id}/items/${grading.items[0].itemId}`, {
    score: 5,
  });
  await call('post', '/release', { appealPeriodDays: 3 });

  // Người dự thi: tóm tắt hạn, mở câu sai, gửi Phúc khảo qua hộp xác nhận.
  await page.goto(`/take/results/${sessionId}`);
  await expect(page.getByTestId('result-hero')).toContainText('8/9');
  await expect(page.getByTestId('appeal-summary')).toContainText('đã dùng 0/3');
  await page.getByRole('button', { name: /^Sai\s*1$/ }).click();
  await expect(page.getByTestId('result-item')).toHaveAttribute('data-verdict', 'wrong');
  await page.getByTestId('appeal-open').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('appeal-left')).toContainText('Bạn còn 3/3 lượt');
  await expect(dialog).toContainText('Điểm có thể tăng hoặc giảm sau khi xem xét lại');
  await expect(dialog.getByTestId('appeal-send')).toBeDisabled();
  await dialog.getByLabel(/Lý do/).fill('ngắn');
  await expect(dialog.getByTestId('appeal-send')).toBeDisabled();
  await dialog.getByLabel(/Lý do/).fill('Tôi nghĩ Huế cũng là một đáp án chấp nhận được');
  const sentAt = performance.now();
  await dialog.getByTestId('appeal-send').click();
  const inItem = page.getByTestId('result-item').getByTestId('appeal-status');
  await expect(inItem).toHaveAttribute('data-status', 'open');
  console.log(
    `[${project}] gửi Phúc khảo → thấy trạng thái: ${(performance.now() - sentAt).toFixed(0)} ms`,
  );
  await expect(page.getByTestId('appeal-summary')).toContainText('đã dùng 1/3');
  await expect(page.getByTestId('appeal-open')).toHaveCount(0); // mỗi câu một lần, không rút được

  // Người ra đề: thấy số chờ, mở màn xử lý, đặt điểm tối đa và trả lời.
  await examiner.goto(`/examiner/sessions/${sessionId}/results`);
  await expect(examiner.getByTestId('handle-appeals')).toContainText('(1)');
  await examiner.getByRole('tab', { name: /^Phúc khảo/ }).click();
  await expect(examiner.getByText('Tôi nghĩ Huế cũng là một đáp án')).toBeVisible();
  await examiner.getByTestId('handle-appeals').click();
  const detail = examiner.getByTestId('appeal-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Thí sinh Phúc khảo');
  await expect(detail).toContainText('Tôi nghĩ Huế cũng là một đáp án');
  await expect(examiner.getByTestId('appeal-subject')).toContainText('Câu');
  await expect(examiner.getByTestId('appeal-grade')).toContainText('0/1');
  await expect(examiner.getByTestId('appeal-answer')).toContainText('Huế');
  await expect(examiner.getByTestId('appeal-resolve')).toBeDisabled(); // cần câu trả lời
  await examiner.getByTestId('appeal-quick-4').click(); // tối đa
  await expect(examiner.getByLabel(/Điểm mới/)).toHaveValue('1');
  await examiner.getByLabel(/Trả lời Người dự thi/).fill('Đã xem lại: chấp nhận Huế');
  const resolvedAt = performance.now();
  await examiner.getByTestId('appeal-resolve').click();
  await expect(examiner.getByTestId('appeal-resolved')).toContainText('Đã xem lại: chấp nhận Huế');
  console.log(
    `[${project}] xử lý Phúc khảo → thấy kết quả: ${(performance.now() - resolvedAt).toFixed(0)} ms`,
  );

  // Gia hạn Thời hạn phúc khảo từ 3 lên 5 ngày.
  await examiner.goto(`/examiner/sessions/${sessionId}/results`);
  await examiner.getByTestId('appeal-extend-open').click();
  await examiner.getByLabel('Thời hạn mới').selectOption('5');
  await examiner.getByTestId('appeal-extend-confirm').click();
  await expect(examiner.getByText('Đã gia hạn Thời hạn phúc khảo').first()).toBeVisible();

  // Người dự thi tải lại: thấy câu trả lời, điểm đã đổi, hạn mới.
  await page.reload();
  await expect(page.getByTestId('result-hero')).toContainText('9/9');
  await page.getByRole('button', { name: /^Đúng\s*4$/ }).click();
  await expect(page.getByTestId('my-appeals')).toBeVisible();
  await page.getByTestId('my-appeals').locator('summary').click();
  await expect(page.getByTestId('my-appeals')).toContainText('Đã xem lại: chấp nhận Huế');
  await expect(page.getByTestId('my-appeals')).toContainText('Từ 0 thành 1');
  await context.close();
});
