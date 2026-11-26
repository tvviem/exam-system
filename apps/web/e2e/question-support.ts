import { expect, type Page } from '@playwright/test';

/**
 * Bấm "Lưu" ở màn soạn câu hỏi và chờ đúng lượt ghi này xong. Không chỉ chờ chữ "Đã lưu Câu hỏi": thông báo của lần lưu
 * trước có thể còn trên màn hình, khi đó có hai thông báo (bài từng đỏ trên CI) hoặc bài đi tiếp khi lần lưu mới chưa xong.
 */
export async function saveQuestion(page: Page) {
  const written = page.waitForResponse(
    (res) =>
      /^\/api\/questions(\/[^/]+)?$/.test(new URL(res.url()).pathname) &&
      ['POST', 'PUT'].includes(res.request().method()),
  );
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  const res = await written;
  expect(res.ok(), `lưu câu hỏi: ${res.status()}`).toBe(true);
  await expect(page.getByText('Đã lưu Câu hỏi').last()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
}
