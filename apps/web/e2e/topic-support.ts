import { expect, type Locator, type Page } from '@playwright/test';

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Chọn một Chủ đề bằng ô gõ để tìm. */
export async function chooseTopic(scope: Page | Locator, name: string, label = 'Chủ đề') {
  const box = scope.getByRole('combobox', { name: label, exact: true });
  await box.click();
  await box.fill(name);
  await scope
    .getByRole('option', { name: new RegExp(`^${escapeRegExp(name)}, \\d+ câu$`) })
    .click();
  await expect(box).toHaveValue(name);
}

/** Như trên, trong hộp "Thêm câu hỏi vào Bộ đề": màn hẹp mở "Bộ lọc" trước rồi quay về danh sách. */
export async function choosePickerTopic(dialog: Locator, name: string) {
  await expect(dialog).toBeVisible();
  const filters = dialog.getByRole('button', { name: /^Bộ lọc/ });
  const narrow = await filters.isVisible();
  if (narrow) await filters.click();
  await chooseTopic(dialog, name);
  if (narrow) await dialog.getByRole('button', { name: /^Xem (danh sách|.*câu)$/ }).click();
}
