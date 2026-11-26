import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ORIGIN, overflow, signIn } from './take-support';

// Số đếm có chặn (docs/plan/quy-mo-lon-thiet-ke.md mục 6.1): hơn 10.000 câu thì Ngân hàng câu hỏi và hộp chọn câu ghi "hơn
// 10.000", gợi ý lọc, và dừng ở trang cuối của 10.000 kết quả đầu. Dữ liệu gieo thẳng vào database E2E.

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const { Client } = apiRequire('pg');
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://exam:exam@127.0.0.1:5434/exam_e2e';

async function seedMany(topicId: string, count: number) {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query(
      `INSERT INTO questions (id, topic_id, owner_id, type, stem, payload, default_points, search_text, updated_at)
       SELECT gen_random_uuid(), t.id, t.owner_id, 'essay',
         jsonb_build_object('type','doc','content', jsonb_build_array(jsonb_build_object('type','paragraph','content',
           jsonb_build_array(jsonb_build_object('type','text','text','Câu số ' || i))))),
         '{"maxLength": 100}', 1, 'cau so ' || i, now() - (i || ' seconds')::interval
       FROM topics t, generate_series(1, $2::int) i WHERE t.id = $1`,
      [topicId, count],
    );
  } finally {
    await db.end();
  }
}

test('Hơn 10.000 câu: ghi "hơn 10.000", gợi ý lọc, dừng ở trang cuối cho phép', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-cap-${p}`);
  const headers = { origin: ORIGIN };
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `Ngân hàng lớn ${p}` });
  await seedMany(topic.id, 10_005);
  const hint = page.getByText('Chỉ hiện 10.000 kết quả đầu', { exact: false });
  const pager = page.getByRole('navigation', { name: 'Phân trang' });

  await page.goto('/examiner/questions');
  await expect(pager).toContainText('1–20 / hơn 10.000');
  await expect(hint).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await page.goto('/examiner/questions?page=500');
  await expect(pager).toContainText('9981–10000 / hơn 10.000');
  await expect(pager.getByRole('button', { name: 'Trang sau' })).toBeDisabled();

  // Địa chỉ trỏ quá mức (đánh dấu cũ, sửa tay) về thẳng trang cuối cho phép.
  await page.goto('/examiner/questions?page=900');
  await expect(pager).toContainText('9981–10000 / hơn 10.000');

  // Tìm thu hẹp: số đếm chính xác, không còn gợi ý.
  await page.goto('/examiner/questions?q=cau%20so%2010003');
  await expect(pager).toContainText('1–1 / 1');
  await expect(hint).toBeHidden();

  // Hộp chọn câu của Bộ đề dùng cùng cách ghi.
  const exam = await post('/api/exams', { title: `Đề từ ngân hàng lớn ${p}` });
  await page.goto(`/examiner/exams/${exam.id}`);
  await page
    .getByRole('button', { name: /^Thêm câu hỏi/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Thêm câu hỏi vào Bộ đề' });
  await expect(dialog.getByRole('navigation', { name: 'Phân trang' })).toContainText('hơn 10.000');
});
