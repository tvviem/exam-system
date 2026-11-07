import { expect, test } from '@playwright/test';
import { examinerPage, ORIGIN, seedOpenSession, signIn } from './take-support';

// Đính chính đáp án (PR 5d-3b; Q302, Q316–Q321). Bộ đề của `seedOpenSession`: chọn một (1 điểm, đáp án o1 "Hà Nội"; o2 "Huế"),
// chọn nhiều (2), chùm (1), tự luận (5). Người dự thi làm đúng hết và được 5/5 tự luận: 9/9. Người ra đề đính chính câu chọn một
// sang "Huế": Người dự thi tụt còn 8/9 và nhận thông báo; Phúc khảo gửi trước đó hiện cảnh báo ở màn xử lý.

const headers = { origin: ORIGIN };

test('Người ra đề đính chính đáp án: xem trước, xác nhận, chấm lại, thông báo, cảnh báo ở Phúc khảo', async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const L = project === 'desktop' ? 'D' : 'M';
  const code = `DCH${L}${Date.now() % 100000}`;
  const examiner = await examinerPage(browser, `e2e-lb-dc-gv-${project}`);
  const sessionId = await seedOpenSession(examiner, `dc-${project}`, code, `DC-${L}-001`);

  const context = await browser.newContext({ baseURL: ORIGIN });
  const page = await context.newPage();
  await signIn(page, `e2e-lb-dc-sv-${project}`);
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
        { itemId: id('single_choice'), value: { optionId: 'o1' }, clientSeq: 1 },
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

  // Người dự thi gửi Phúc khảo câu chọn một TRƯỚC khi đính chính (qua API).
  const sentAppeal = await page.request.post(`/api/take/sessions/${sessionId}/appeals`, {
    headers,
    data: { target: 'response', no: 1, reason: 'Tôi muốn chắc điểm câu này đúng' },
  });
  expect(sentAppeal.ok(), await sentAppeal.text()).toBe(true);
  await page.goto(`/take/results/${sessionId}`);
  await expect(page.getByTestId('result-hero')).toContainText('9/9');

  // Người ra đề: Thống kê câu → Đính chính câu 1 → chọn "Huế" → xem trước → xác nhận → xong.
  await examiner.goto(`/examiner/sessions/${sessionId}/results`);
  await examiner.getByRole('tab', { name: 'Thống kê câu' }).click();
  await examiner.getByTestId('key-fix-1').click();
  const dialog = examiner.getByRole('dialog', { name: 'Đính chính đáp án Câu 1' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('key-preview')).toBeDisabled(); // chưa chọn đáp án khác
  await dialog.getByRole('radio', { name: /Huế/ }).check();
  await dialog.getByLabel(/Lý do/).fill('Nhập nhầm đáp án, đáp án đúng là Huế');
  const previewedAt = performance.now();
  await dialog.getByTestId('key-preview').click();
  await expect(dialog.getByTestId('key-impact')).toContainText('0 người tăng điểm, 1 người giảm');
  console.log(
    `[${project}] xem trước tác động: ${(performance.now() - previewedAt).toFixed(0)} ms`,
  );
  await expect(dialog.getByTestId('key-impact')).toContainText('Có 1 Phúc khảo đang chờ');
  await expect(dialog).toContainText('Câu gốc trong Ngân hàng câu hỏi chưa được sửa');
  await dialog.getByTestId('key-confirm').click();
  await expect(dialog.getByTestId('key-progress')).toHaveAttribute('data-status', 'done');
  await expect(dialog).toContainText('Xong: 0 người tăng điểm, 1 người giảm');
  await dialog.getByTestId('key-close').click();
  await expect(examiner.getByText('Đã đính chính 1 lần')).toBeVisible();

  // Màn xử lý Phúc khảo: cảnh báo điểm tự động vừa đổi và đường tắt Đính chính cho cả Phiên thi (chủ Bộ đề).
  await examiner.goto(`/examiner/sessions/${sessionId}/appeals`);
  await expect(examiner.getByTestId('appeal-correction')).toContainText('vừa đổi do Đính chính');
  await expect(examiner.getByTestId('appeal-correction')).toContainText('từ 1 thành 0');
  await examiner.getByTestId('appeal-fix-class').click();
  await expect(examiner.getByRole('dialog', { name: 'Đính chính đáp án Câu 1' })).toBeVisible();
  await examiner.keyboard.press('Escape');

  // Người dự thi: điểm đã đổi và có thông báo.
  await page.reload();
  await expect(page.getByTestId('result-hero')).toContainText('8/9');
  await page.getByRole('button', { name: /^Thông báo/ }).click();
  await expect(
    page.getByText(/Điểm Câu 1 .* đã được điều chỉnh do đính chính đáp án/),
  ).toBeVisible();

  // Trang Bộ đề đã Phát hành: nút Đính chính đáp án mở danh sách câu (không có câu tự luận).
  const exam = await (await examiner.request.get(`/api/sessions/${sessionId}/results`)).json();
  await examiner.goto(`/examiner/exams/${exam.session.examId}`);
  await examiner.getByTestId('key-fix-open').click();
  const picker = examiner.getByRole('dialog', { name: 'Đính chính đáp án' });
  await expect(picker.getByTestId('key-pick')).toHaveCount(3);
  await expect(picker.getByTestId('key-pick').first()).toContainText('đã đính chính 1 lần');
  await context.close();
});
