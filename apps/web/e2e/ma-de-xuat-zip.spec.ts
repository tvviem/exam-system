import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { seedSession } from './ma-de-support';
import { signIn } from './take-support';

// V5b (docs/plan/ma-de-phien-thi-thiet-ke.md mục 4.4, Q473): xuất tất cả Mã đề thành zip (tab Đề) và Excel phân Mã đề (Danh sách dự thi).
// Chạy trên cả desktop và mobile.

/** Tên các tệp trong một zip, đọc từ thư mục trung tâm cuối tệp (không quét tín hiệu đầu tệp vì zip lồng nhau). */
function zipNames(bytes: Buffer): string[] {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  expect(end, 'không thấy thư mục trung tâm của zip').toBeGreaterThanOrEqual(0);
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    names.push(bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names.sort();
}

/** Chụp ảnh để xem bằng mắt khi đặt SHOTS=<thư mục> (không chụp trong CI). */
const shot = async (page: Page, name: string) => {
  if (!process.env.SHOTS) return;
  await page.screenshot({ path: `${process.env.SHOTS}/ma-de-${name}.png` });
};

const openVariantsTab = async (page: Page) => {
  await page.getByRole('tab', { name: 'Đề', exact: true }).click();
  await expect(page.getByTestId('variants-tab')).toBeVisible();
};

test('Tab Đề: Xuất tất cả Mã đề thành zip (Đề và Excel), rồi zip kèm Đáp án có xác nhận', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-mdw-${p}`);
  const { id } = await seedSession(
    page,
    p,
    `Zip ${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`,
    {
      shared: true,
      variantCount: 3,
    },
  );
  await page.goto(`/examiner/sessions/${id}?tab=variants`);
  await expect(page.getByTestId('variants-tab')).toBeVisible();

  await shot(page, `tab-de-zip-${p}`);
  await page.getByRole('button', { name: 'Xuất tất cả Mã đề (zip)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Xuất tất cả Mã đề' });
  await expect(dialog).toBeVisible();
  await shot(page, `hop-zip-${p}`);
  await expect(dialog.getByText(/Không có đáp án/)).toBeVisible();
  // Chế độ zip không có ô "Mã đề" nhập tay (mỗi Mã đề có nhãn riêng); mở "Tùy chỉnh" để kiểm.
  await dialog.getByText('Tùy chỉnh').click();
  await expect(dialog.getByLabel('Mã đề', { exact: true })).toHaveCount(0);
  const download = dialog.getByRole('button', { name: 'Tải tệp zip' });
  await expect(download).toBeDisabled(); // Học phần bắt buộc
  await dialog.getByLabel('Học phần').fill('Tin học đại cương');
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(file.suggestedFilename()).toMatch(/^ma-de-.*\.zip$/);
  const names = zipNames(await readFile(await file.path()));
  expect(names.filter((n) => /^de-thi-.*-de-[123]\.docx$/.test(n))).toHaveLength(3);
  expect(names.filter((n) => /^phan-ma-de-.*\.xlsx$/.test(n))).toHaveLength(1);
  expect(names.filter((n) => n.startsWith('dap-an'))).toEqual([]);
  await expect(page.getByText('Đã xuất tệp zip', { exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();

  // Kèm Đáp án: hộp xác nhận "tệp chứa đáp án đúng", rồi zip có thêm 3 tệp Đáp án.
  await page.getByRole('button', { name: 'Xuất tất cả Mã đề (zip)' }).click();
  const second = page.getByRole('dialog', { name: 'Xuất tất cả Mã đề' });
  await second.getByLabel('Học phần').fill('Tin học đại cương');
  await second.getByRole('button', { name: 'Tải zip kèm Đáp án…' }).click();
  await expect(second.getByText('Tệp này chứa đáp án đúng')).toBeVisible();
  const [withKey] = await Promise.all([
    page.waitForEvent('download'),
    second.getByRole('button', { name: 'Tôi hiểu, tải tệp Đáp án' }).click(),
  ]);
  const all = zipNames(await readFile(await withKey.path()));
  expect(all.filter((n) => /^dap-an-.*-de-[123]\.docx$/.test(n))).toHaveLength(3);
  expect(all.filter((n) => n.startsWith('de-thi'))).toHaveLength(3);
  expect(all).toHaveLength(7);
  await expect(page.getByText('Đã xuất tệp zip kèm Đáp án', { exact: true })).toBeVisible();
});

test('Danh sách dự thi: tải Excel phân Mã đề', async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-mdw-${p}`);
  const { id } = await seedSession(
    page,
    p,
    `Excel ${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`,
    {
      shared: true,
      variantCount: 2,
    },
  );
  await page.goto(`/examiner/sessions/${id}?tab=roster`);
  await expect(page.getByTestId('roster-variants')).toBeVisible();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Tải Excel phân Mã đề' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^phan-ma-de-.*\.xlsx$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 2).toString('latin1'), 'tệp .xlsx là gói zip').toBe('PK');
  expect(zipNames(bytes)).toContain('xl/workbook.xml');
  await expect(page.getByText('Đã xuất Excel phân Mã đề.')).toBeVisible();
});

test('Phiên thi một Mã đề hay mỗi người một đề: không có nút xuất zip và Excel phân Mã đề', async ({
  page,
}, testInfo) => {
  const p = testInfo.project.name;
  await signIn(page, `e2e-mdw-${p}`);
  const tag = `${p}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
  const one = await seedSession(page, p, `Zip một Mã đề ${tag}`, { shared: true, variantCount: 1 });
  await page.goto(`/examiner/sessions/${one.id}?tab=variants`);
  await openVariantsTab(page);
  await expect(page.getByRole('button', { name: 'Xuất Word Mã đề này' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xuất tất cả Mã đề (zip)' })).toHaveCount(0);
  await page.goto(`/examiner/sessions/${one.id}?tab=roster`);
  await expect(page.getByText(`Sinh viên Chia 1 ${p}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải Excel phân Mã đề' })).toHaveCount(0);

  const per = await seedSession(page, p, `Zip mỗi người ${tag}`, { shared: false });
  await page.goto(`/examiner/sessions/${per.id}?tab=roster`);
  await expect(page.getByText(`Sinh viên Chia 1 ${p}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải Excel phân Mã đề' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Đề', exact: true })).toHaveCount(0);
});
