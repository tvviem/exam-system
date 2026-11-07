import { expect, test } from '@playwright/test';
import { examinerPage, ORIGIN, seedOpenSession, signIn } from './take-support';

// Chấm Câu tự luận, Kết quả, Mức xử lý và Ủy quyền (PR 5b-2). Bộ đề của `seedOpenSession`: chọn một (1 điểm), chọn nhiều (2),
// chùm (1), tự luận (5). Hai Người dự thi cùng bỏ trống phần trắc nghiệm và viết tự luận; Người ra đề chấm 2,5 và 5 điểm.

const headers = { origin: ORIGIN };

test('chấm tự luận bằng nút và phím, Kết quả, Mức xử lý, Ủy quyền chấm', async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const L = project === 'desktop' ? 'D' : 'M';
  const code = `CHM${L}${Date.now() % 100000}`;
  const examiner = await examinerPage(browser, `e2e-lb-cm-gv-${project}`);
  const sessionId = await seedOpenSession(examiner, `cm-${project}`, code, `CM-${L}-001`);
  const added = await examiner.request.post(`/api/sessions/${sessionId}/roster`, {
    headers,
    data: { codes: [`CM-${L}-002`] },
  });
  expect(added.ok(), await added.text()).toBe(true);

  // Hai Người dự thi làm và nộp bài (qua API cho nhanh); Người ra đề Cảnh cáo một người trước khi họ nộp.
  const attempts: string[] = [];
  for (const n of [1, 2]) {
    const context = await browser.newContext({ baseURL: ORIGIN });
    const page = await context.newPage();
    await signIn(page, `e2e-lb-cm-sv${n}-${project}`);
    const post = await page.request.post('/api/take/join', { headers, data: { code } });
    expect(post.ok(), await post.text()).toBe(true);
    const start = await (
      await page.request.post(`/api/take/sessions/${sessionId}/start`, { headers, data: {} })
    ).json();
    if (n === 1) {
      const warn = await examiner.request.post(
        `/api/sessions/${sessionId}/attempts/${start.attempt.id}/violations`,
        {
          headers,
          data: { action: 'warning', reason: 'Nhìn bài bạn' },
        },
      );
      expect(warn.ok(), await warn.text()).toBe(true);
    }
    const attempt = await (await page.request.get(`/api/take/attempts/${start.attempt.id}`)).json();
    const essayItem = attempt.sections[0].items.find((i: { type: string }) => i.type === 'essay');
    const saved = await page.request.put(`/api/take/attempts/${start.attempt.id}/responses`, {
      headers,
      data: {
        items: [{ itemId: essayItem.itemId, value: { text: `Bài tự luận số ${n}` }, clientSeq: 1 }],
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    await page.request.post(`/api/take/attempts/${start.attempt.id}/submit`, { headers, data: {} });
    attempts.push(start.attempt.id);
    await context.close();
  }

  // Kết quả: Chấm ẩn tên che điểm tự luận; vào màn Chấm.
  await examiner.goto(`/examiner/sessions/${sessionId}?tab=results`);
  await expect(examiner.getByText('Chấm ẩn tên đang che điểm các câu tự luận')).toBeVisible();
  await expect(examiner.getByRole('link', { name: /Chấm tự luận \(2\)/ })).toBeVisible();
  await examiner.getByRole('link', { name: /Chấm tự luận/ }).click();

  // Màn Chấm: nhãn "Bài N" (không tên), bấm nút ½ rồi phím 5.
  await expect(examiner.getByText('Đã chấm 0/2')).toBeVisible();
  await expect(examiner.getByTestId('answer')).toContainText('Bài tự luận số');
  await expect(examiner.getByText(/Thí sinh Chấm bài/)).toHaveCount(0);
  const started = performance.now();
  await examiner.getByTestId('quick-3').click(); // ½ của 5 điểm = 2,5
  await expect(examiner.getByText('Đã chấm 1/2')).toBeVisible();
  console.log(
    `[${project}] bấm điểm → tiến độ đổi: ${(performance.now() - started).toFixed(0)} ms`,
  );
  await expect(examiner.getByRole('status').filter({ hasText: 'Hoàn tác' })).toBeVisible();
  await examiner.keyboard.press('5'); // tối đa = 5 điểm
  await expect(examiner.getByText('Đã chấm 2/2')).toBeVisible();
  await expect(examiner.getByText('Đã chấm hết Câu 4')).toBeVisible();

  // Về Kết quả: điểm tự luận đã hiện (2,5 và 5), Cảnh cáo chưa quyết.
  await examiner.getByRole('link', { name: 'Về Kết quả' }).first().click();
  await expect(examiner.getByText('Chấm ẩn tên đang che')).toHaveCount(0);
  await expect(examiner.getByText('Còn 1 Vi phạm chưa quyết')).toBeVisible();
  // Điểm thô 2,5 và 5 (tự luận; phần trắc nghiệm bỏ trống) hiện ở bảng (máy tính) hoặc thẻ (điện thoại).
  const visibleText = examiner.getByText(/2,5/).filter({ visible: true });
  await expect(visibleText.first()).toBeVisible();

  // Mức xử lý: trừ 10 % cho Người dự thi bị Cảnh cáo.
  await examiner.getByRole('tab', { name: /^Vi phạm/ }).click();
  await examiner.getByLabel('Phần trăm bị trừ').fill('10');
  await examiner.getByRole('button', { name: 'Trừ', exact: true }).click();
  await expect(examiner.getByText('Đã lưu Mức xử lý').first()).toBeVisible();
  await examiner.getByRole('tab', { name: 'Người dự thi' }).click();
  await expect(examiner.getByText('Trừ 10%').filter({ visible: true }).first()).toBeVisible();

  // Thống kê câu.
  await examiner.getByRole('tab', { name: 'Thống kê câu' }).click();
  await expect(examiner.getByText('Câu 4').first()).toBeVisible();

  // Ủy quyền: Quản trị viên cấp cho Giám khảo; người này thấy Phiên thi trong danh sách và vào được Kết quả.
  const admin = await examinerPage(browser, `e2e-lb-cm-qt-${project}`);
  await admin.goto('/admin/grading-delegates');
  await admin.getByLabel('Tìm Phiên thi theo tên').fill(`Ca làm bài cm-${project}`);
  // Danh sách lọc sau 300 ms: chỉ bấm vào đúng dòng của Phiên thi này, không phải dòng đầu tiên lúc chưa lọc.
  const row = admin.getByRole('listitem').filter({ hasText: `Ca làm bài cm-${project}` });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Ủy quyền' }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel('Tìm Người ra đề').fill(`Chấm thay (${project})`);
  await dialog.getByRole('button', { name: 'Ủy quyền', exact: true }).first().click();
  await expect(dialog.getByText('Đang ủy quyền cho')).toBeVisible();

  const delegate = await examinerPage(browser, `e2e-lb-cm-gv2-${project}`);
  await delegate.goto('/examiner/sessions');
  await expect(delegate.getByText('Được ủy quyền chấm').first()).toBeVisible();
  await delegate
    .getByRole('link', { name: new RegExp(`Ca làm bài cm-${project}`) })
    .first()
    .click();
  await expect(delegate.getByText('Được ủy quyền chấm').first()).toBeVisible();
  await expect(delegate.getByRole('link', { name: /Chấm tự luận/ })).toBeVisible();
  expect(attempts).toHaveLength(2);
});
