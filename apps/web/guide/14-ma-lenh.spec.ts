import { expect, test } from '@playwright/test';
import { chooseTopic } from '../e2e/topic-support';
import { ORIGIN, openPage, shot, signIn } from './support';

// Mã lệnh trong Câu hỏi (tài liệu nguoi-ra-de.md mục 3.4 và nguoi-du-thi.md). Chạy sau cùng, dùng Chủ đề riêng nên không đổi số
// liệu trong ảnh của các bước trước.

test('Soạn câu hỏi có mã lệnh và xem trên điện thoại', async ({ browser }) => {
  const page = await openPage(browser, 'desktop');
  // Người ra đề thứ hai: tài khoản chính đã đăng nhập nhiều lần ở các bước trước, chạm giới hạn 10 lần mỗi 10 phút.
  await signIn(page, 'le.hung');
  const topic = await page.request.post('/api/topics', {
    headers: { origin: ORIGIN },
    data: { name: 'Lập trình C' },
  });
  expect(topic.ok(), await topic.text()).toBe(true);
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Soạn câu hỏi' }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /^Chọn một/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Soạn câu hỏi', level: 1 })).toBeVisible();
  await chooseTopic(page, 'Lập trình C');

  const stem = page.getByRole('textbox', { name: 'Phần dẫn' });
  const bar = page.getByRole('toolbar', { name: /Định dạng cho Phần dẫn/ });
  const inline = bar.getByRole('button', { name: 'Mã trong dòng' });
  const block = bar.getByRole('button', { name: 'Khối mã' });
  await stem.click();
  await page.keyboard.type('Đoạn mã sau in ra giá trị nào của ');
  await inline.click();
  await page.keyboard.type('s');
  await inline.click();
  await page.keyboard.type('?');
  await page.keyboard.press('Enter');
  await block.click();
  await page.keyboard.type('int s = 0;');
  await page.keyboard.press('Enter');
  await page.keyboard.type('for (int i = 1; i <= 4; i++)');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('s = s + i;');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('printf("%d", s);');
  for (const [name, value] of [
    ['Phương án A', '10'],
    ['Phương án B', '4'],
  ] as const) {
    await page.getByRole('textbox', { name }).click();
    await page
      .getByRole('toolbar', { name: new RegExp(`Định dạng cho ${name}`) })
      .getByRole('button', { name: 'Mã trong dòng' })
      .click();
    await page.keyboard.type(value);
  }
  await page.getByRole('radio', { name: /Phương án A/ }).check();
  await stem.locator('pre').click();
  await shot(page, 'nguoi-ra-de', '28-soan-ma-lenh', {
    clip: page.getByText('Phần dẫn', { exact: true }).locator('xpath=..'),
    marks: [
      { at: inline, text: 'Mã trong dòng: tên biến, câu lệnh ngắn xen trong câu' },
      { at: block, text: 'Khối mã: đoạn mã nhiều dòng; Tab thụt lề, Shift+Tab lùi lề' },
      { at: stem.locator('pre'), text: 'Mã đang soạn, giữ nguyên thụt lề' },
    ],
  });
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
  const questionId = new URL(page.url()).pathname.split('/').pop() as string;
  const preview = page.getByTestId('question-preview');
  await expect(preview.locator('pre')).toBeVisible();
  await shot(page, 'nguoi-ra-de', '29-xem-thu-ma-lenh', {
    clip: preview,
    marks: [{ at: preview.locator('pre'), text: 'Xem thử: khối mã có số dòng như màn làm bài' }],
  });

  // Màn làm bài trên điện thoại: dựng Bộ đề một câu và Phiên thi, mở "Xem thử" Phiên thi (cùng giao diện với Người dự thi).
  const send = async (method: 'post' | 'put', url: string, data: unknown) => {
    const res = await page.request[method](url, { headers: { origin: ORIGIN }, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const empty = { type: 'doc', content: [{ type: 'paragraph' }] };
  const exam = await send('post', '/api/exams', { title: 'Kiểm tra nhanh Lập trình C' });
  const draft = await send('put', `/api/exams/${exam.id}`, {
    title: exam.title,
    instructions: empty,
    version: exam.version,
    sections: [
      {
        id: exam.sections[0].id,
        title: null,
        instructions: empty,
        items: [{ questionId, points: 1 }],
      },
    ],
  });
  await send('post', `/api/exams/${exam.id}/publish`, { version: draft.version });
  const day = 86_400_000;
  const session = await send('post', '/api/sessions', {
    examId: exam.id,
    title: 'Lập trình C - kiểm tra nhanh',
    opensAt: new Date(Date.now() + day).toISOString(),
    closesAt: new Date(Date.now() + day + 3_600_000).toISOString(),
    durationMinutes: 15,
    accessCode: 'LTC7K2',
  });

  const phone = await openPage(browser, 'phone');
  await signIn(phone, 'le.hung');
  await phone.goto(`/examiner/sessions/${session.id}/try`);
  const code = phone.locator('pre');
  await expect(code).toBeVisible();
  await code.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(phone, 'nguoi-du-thi', '24-cau-hoi-co-ma', {
    marks: [{ at: code, text: 'Số dòng ở lề trái; dòng dài tự xuống hàng' }],
  });
});
