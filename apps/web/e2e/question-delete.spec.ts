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

test('Xóa Câu hỏi: về danh sách ngay, không chờ truy vấn chi tiết đã xóa thử lại', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-xc-${p}`);
  const headers = { origin: ORIGIN };
  const topic = await (
    await page.request.post('/api/topics', { headers, data: { name: `Chủ đề xóa ${p}` } })
  ).json();
  const created = await page.request.post('/api/questions', {
    headers,
    data: {
      type: 'single_choice',
      topicId: topic.id,
      stem: rich(`Câu sẽ xóa ${p}`),
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
  expect(created.ok(), await created.text()).toBe(true);
  await page.goto(`/examiner/questions/${(await created.json()).id}`);
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  const started = Date.now();
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/examiner/questions', { timeout: 20_000 });
  const took = Date.now() - started;
  expect(took, `về danh sách sau ${took} ms`).toBeLessThan(2500);
});
