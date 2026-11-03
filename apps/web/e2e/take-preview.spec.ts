import { expect, test } from '@playwright/test';
import { examinerPage, seedOpenSession } from './take-support';

// Xem thử qua Phiên thi (Q220, Q245, Q250): Người ra đề đi qua đề đúng như Người dự thi thấy, không ghi gì.

test('Xem thử: làm thử các câu, không gửi gì lên server, tải lại thì mất, kết thúc quay về Phiên thi', async ({
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const examiner = await examinerPage(browser, `e2e-lb-pvgv-${p}`);
  const sessionId = await seedOpenSession(examiner, `${p}-pv`, `TKPV${tag}`, `TK10-${tag}-001`);

  const writes: string[] = [];
  const reads: string[] = [];
  examiner.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return;
    (request.method() === 'GET' ? reads : writes).push(`${request.method()} ${path}`);
  });

  await examiner.goto(`/examiner/sessions/${sessionId}`);
  await examiner.getByRole('link', { name: 'Xem thử' }).click();
  await expect(examiner).toHaveURL(new RegExp(`/examiner/sessions/${sessionId}/try$`));

  // Dải báo xem thử, không có đồng hồ, không có chỉ báo lưu
  await expect(examiner.getByText(`Đang xem thử: Ca làm bài ${p}-pv`)).toBeVisible();
  await expect(examiner.getByRole('timer')).toHaveCount(0);
  await expect(examiner.getByRole('status', { name: 'Trạng thái lưu' })).toHaveCount(0);
  await examiner.getByRole('button', { name: 'Cả đề' }).click();

  // Làm thử: chọn, viết; mọi thứ chỉ ở trang
  await examiner.getByRole('radio', { name: 'Hà Nội' }).check();
  await examiner.getByRole('checkbox', { name: 'hai' }).check();
  await examiner.getByRole('textbox', { name: 'Câu trả lời' }).fill('Thử viết một câu.');
  await examiner.getByRole('textbox', { name: 'Câu trả lời' }).blur();
  await expect(examiner.getByRole('radio', { name: 'Hà Nội' })).toBeChecked();
  await examiner.waitForTimeout(1500); // đủ lâu để một hàng đợi lưu (nếu có) kịp gửi

  expect(writes, 'xem thử không được gửi yêu cầu ghi nào').toEqual([]);
  expect(
    reads.filter((read) => read.includes('/take/')),
    'không đụng khu làm bài',
  ).toEqual([]);
  expect(reads).toContain(`GET /api/sessions/${sessionId}/try`);

  // Tải lại: dựng lại đề, câu trả lời mất
  await examiner.reload();
  await examiner.getByRole('button', { name: 'Cả đề' }).click();
  await expect(examiner.getByRole('radio', { name: 'Hà Nội' })).not.toBeChecked();
  await expect(examiner.getByRole('textbox', { name: 'Câu trả lời' })).toHaveValue('');

  // Không có bản sao đề hay hàng đợi nào được giữ trên máy cho khu làm bài (kho có thể đã được mở rỗng lúc chưa đăng nhập)
  const records = await examiner.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('exam-take');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const names = ['views', 'queues'].filter((name) => db.objectStoreNames.contains(name));
          if (names.length === 0) return resolve(0);
          const tx = db.transaction(names);
          const counts = names.map((name) => tx.objectStore(name).count());
          tx.oncomplete = () => resolve(counts.reduce((sum, c) => sum + c.result, 0));
        };
      }),
  );
  expect(records).toBe(0);

  // Kết thúc xem thử: về trang Phiên thi, không có hộp thoại Nộp bài
  await examiner.getByRole('button', { name: 'Kết thúc xem thử' }).click();
  await expect(examiner).toHaveURL(new RegExp(`/examiner/sessions/${sessionId}$`));
  await expect(examiner.getByRole('heading', { name: `Ca làm bài ${p}-pv` })).toBeVisible();
  expect(writes).toEqual([]);
});

test('Xem thử: Người ra đề khác mở đường dẫn thì chỉ thấy lỗi, không thấy đề', async ({
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const owner = await examinerPage(browser, `e2e-lb-pvgv-${p}`);
  const sessionId = await seedOpenSession(owner, `${p}-pv2`, `TKQV${tag}`, `TK10-${tag}-001`);

  const stranger = await examinerPage(browser, `e2e-lb-pvlg-${p}`);
  await stranger.goto(`/examiner/sessions/${sessionId}/try`);
  await expect(stranger.getByRole('alert')).toBeVisible();
  await expect(stranger.getByRole('link', { name: 'Về Phiên thi' })).toBeVisible();
  await expect(stranger.getByText(`Đề làm bài ${p}-pv2`)).toHaveCount(0);
  await expect(stranger.getByRole('button', { name: 'Kết thúc xem thử' })).toHaveCount(0);
});
