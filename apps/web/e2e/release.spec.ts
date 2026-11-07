import { expect, test } from '@playwright/test';
import { examinerPage, ORIGIN, seedOpenSession, signIn } from './take-support';

// Công bố kết quả và "Kết quả của tôi" tô màu theo mức đạt (PR 5c-2). Bộ đề của `seedOpenSession`: chọn một (1 điểm, đáp án o1),
// chọn nhiều (2, o1+o3), chùm (1, s1 đúng s2 sai), tự luận (5). Thí sinh 1 làm đúng hết và được điểm tối đa tự luận (100 %);
// thí sinh 2 chỉ viết tự luận và bị chấm 0 (0 %).

const headers = { origin: ORIGIN };

test('Công bố, khóa chấm, Người dự thi xem Kết quả tô màu theo mức đạt, xuất Excel', async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const L = project === 'desktop' ? 'D' : 'M';
  const code = `CKB${L}${Date.now() % 100000}`;
  const examiner = await examinerPage(browser, `e2e-lb-ck-gv-${project}`);
  const sessionId = await seedOpenSession(examiner, `ck-${project}`, code, `CK-${L}-001`);
  const added = await examiner.request.post(`/api/sessions/${sessionId}/roster`, {
    headers,
    data: { codes: [`CK-${L}-002`] },
  });
  expect(added.ok(), await added.text()).toBe(true);

  // Hai Người dự thi làm bài và nộp (qua API cho nhanh).
  const attempts: string[] = [];
  for (const n of [1, 2]) {
    const context = await browser.newContext({ baseURL: ORIGIN });
    const page = await context.newPage();
    await signIn(page, `e2e-lb-ck-sv${n}-${project}`);
    expect((await page.request.post('/api/take/join', { headers, data: { code } })).ok()).toBe(
      true,
    );
    const start = await (
      await page.request.post(`/api/take/sessions/${sessionId}/start`, { headers, data: {} })
    ).json();
    const view = await (await page.request.get(`/api/take/attempts/${start.attempt.id}`)).json();
    const item = (type: string) =>
      view.sections[0].items.find((i: { type: string }) => i.type === type).itemId;
    const answers =
      n === 1
        ? [
            { itemId: item('single_choice'), value: { optionId: 'o1' } },
            { itemId: item('multiple_choice'), value: { optionIds: ['o1', 'o3'] } },
            { itemId: item('true_false_cluster'), value: { answers: { s1: true, s2: false } } },
            { itemId: item('essay'), value: { text: 'Giới hạn là… (bài làm đầy đủ)' } },
          ]
        : [{ itemId: item('essay'), value: { text: 'Em chưa làm được' } }];
    const saved = await page.request.put(`/api/take/attempts/${start.attempt.id}/responses`, {
      headers,
      data: { items: answers.map((a) => ({ ...a, clientSeq: 1 })) },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    await page.request.post(`/api/take/attempts/${start.attempt.id}/submit`, { headers, data: {} });
    attempts.push(start.attempt.id);
    await context.close();
  }

  // Người ra đề: đóng cửa vào thi (kết thúc), chấm hai bài tự luận qua API (giao diện chấm đã có E2E riêng).
  expect(
    (
      await examiner.request.post(`/api/sessions/${sessionId}/close-entry`, { headers, data: {} })
    ).ok(),
  ).toBe(true);
  const items = await (
    await examiner.request.get(`/api/sessions/${sessionId}/grading/items`)
  ).json();
  const essay = items.items[0].itemId as string;
  const put = async (attemptId: string, score: number) => {
    const res = await examiner.request.put(
      `/api/sessions/${sessionId}/grading/attempts/${attemptId}/items/${essay}`,
      {
        headers,
        data: { score, feedback: score > 0 ? 'Bài làm rất tốt' : 'Cần ôn lại phần giới hạn' },
      },
    );
    expect(res.ok(), await res.text()).toBe(true);
  };
  await put(attempts[0] as string, 5);
  await put(attempts[1] as string, 0);

  // Kết quả: nút Công bố bật; chọn "Không nhận Phúc khảo" cho nhanh? Dùng 3 ngày mặc định.
  await examiner.goto(`/examiner/sessions/${sessionId}?tab=results`);
  const publish = examiner.getByRole('button', { name: 'Công bố kết quả' });
  await expect(publish).toBeEnabled();
  await publish.click();
  const dialog = examiner.getByRole('dialog', { name: 'Công bố kết quả' });
  await expect(dialog.getByText('2 Người dự thi sẽ nhận được Kết quả')).toBeVisible();
  await expect(dialog.getByLabel('Thời hạn Phúc khảo')).toHaveValue('3');
  await dialog.getByRole('button', { name: 'Công bố', exact: true }).click();
  await expect(examiner.getByText(/Đã Công bố lúc .* · Phúc khảo đến/)).toBeVisible();
  await expect(examiner.getByText('Đã Công bố nên điểm tự luận')).toBeVisible();
  await expect(examiner.getByRole('link', { name: /Chấm tự luận/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(examiner.getByRole('button', { name: 'Công bố kết quả' })).toHaveCount(0);

  // Xuất Excel.
  const xlsx = await examiner.request.get(`/api/sessions/${sessionId}/results.xlsx`);
  expect(xlsx.ok()).toBe(true);
  expect(xlsx.headers()['content-type']).toContain('spreadsheetml');

  // Người dự thi 1 (100 %): xuất sắc. Người dự thi 2 (0 %): cần cố gắng thêm.
  const results: Record<number, { band: string | null; label: string }> = {};
  for (const n of [1, 2]) {
    const context = await browser.newContext({ baseURL: ORIGIN });
    const page = await context.newPage();
    await signIn(page, `e2e-lb-ck-sv${n}-${project}`);
    await page.goto('/take');
    await page.getByRole('link', { name: 'Xem Kết quả' }).first().click();
    const hero = page.getByTestId('result-hero');
    await expect(hero).toBeVisible();
    results[n] = {
      band: await hero.getAttribute('data-band'),
      label: (await hero.textContent()) ?? '',
    };
    if (n === 1) {
      await expect(page.getByText('Xuất sắc')).toBeVisible();
      await expect(page.getByText('Giới hạn là… (bài làm đầy đủ)')).toBeHidden(); // đóng sẵn, mở bằng chi tiết
      await page.getByText('Tự luận').first().click();
      await expect(page.getByText('Giới hạn là… (bài làm đầy đủ)')).toBeVisible();
      await expect(page.getByText('Bài làm rất tốt')).toBeVisible();
      await expect(page.getByText(/Bạn có thể gửi Phúc khảo đến/)).toBeVisible();
    } else {
      await expect(page.getByText('Cần cố gắng thêm')).toBeVisible();
    }
    // Không có đáp án đúng nào trên màn (chưa bật xem lại đề).
    await expect(page.getByText('Hà Nội')).toHaveCount(0);
    await context.close();
  }
  expect(results[1]?.band).toBe('excellent');
  expect(results[1]?.label).toContain('10');
  expect(results[2]?.band).toBe('low');
});
