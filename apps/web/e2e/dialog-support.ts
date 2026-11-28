import { expect, type Locator } from '@playwright/test';

/**
 * Hộp thoại có nội dung dài hơn khung: thanh nút dưới đáy nằm sát đáy hộp, không chừa khe để dòng đang cuộn lộ ra bên dưới.
 */
export async function expectFooterAtBottom(dialog: Locator, button: Locator) {
  const overflows = await dialog.evaluate((root) =>
    [root, ...root.querySelectorAll('*')].some(
      (el) =>
        el.scrollHeight > el.clientHeight + 1 &&
        ['auto', 'scroll'].includes(getComputedStyle(el).overflowY),
    ),
  );
  expect(overflows, 'nội dung phải dài hơn khung thì phép đo mới có nghĩa').toBe(true);
  const box = await dialog.boundingBox();
  const at = await button.boundingBox();
  if (!box || !at) throw new Error('không thấy hộp thoại hay nút');
  expect(Math.round(box.y + box.height - (at.y + at.height))).toBeLessThanOrEqual(16);
}
