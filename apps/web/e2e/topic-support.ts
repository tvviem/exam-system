import { expect, type Locator } from '@playwright/test';

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Chọn Chủ đề bằng ô gõ để tìm của hộp "Thêm câu hỏi vào Bộ đề". Màn hẹp: mở "Bộ lọc" trước rồi quay về danh sách.
 */
export async function choosePickerTopic(dialog: Locator, name: string) {
  await expect(dialog).toBeVisible();
  const filters = dialog.getByRole('button', { name: /^Bộ lọc/ });
  const narrow = await filters.isVisible();
  if (narrow) await filters.click();
  const box = dialog.getByRole('combobox', { name: 'Chủ đề' });
  await box.click();
  await box.fill(name);
  await dialog
    .getByRole('option', { name: new RegExp(`^${escapeRegExp(name)}, \\d+ câu$`) })
    .click();
  await expect(box).toHaveValue(name);
  if (narrow) await dialog.getByRole('button', { name: /^Xem (danh sách|.*câu)$/ }).click();
}
