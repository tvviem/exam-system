import { expect, test } from '@playwright/test';
import { openMonitor, openPerson, room } from './monitor-support';
import { overflow } from './take-support';

// S6 (Q273–Q280): thang bảo vệ Buộc nộp nhầm. Tầng B: gõ lại Mã định danh (một người) hay số người (nhóm) mới bấm được. Tầng A:
// Hoàn tác trong 10 phút; Người dự thi tự về đề, các câu đã lưu còn nguyên. Đo thời gian thật (không tua đồng hồ).

const PUSH_BUDGET_MS = 3000;

test('Buộc nộp phải gõ lại Mã định danh; Hoàn tác đưa Người dự thi về đề với câu đã lưu còn nguyên', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const letter = project === 'desktop' ? 'D' : 'M';
  const { examiner, sessionId, candidate } = await room(browser, project, 'U', {
    prefix: 'ud',
    fakeClock: false,
  });
  const sv1 = await candidate(1);
  const sv2 = await candidate(2);
  await sv1.getByRole('radio', { name: 'Hà Nội' }).check();
  await expect(sv1.getByRole('status', { name: 'Trạng thái lưu' })).toContainText('Đã lưu');

  await openMonitor(examiner, sessionId);
  await openPerson(examiner, /Thí sinh Hoàn tác 1/);
  const panel =
    project === 'mobile' ? examiner.getByRole('dialog') : examiner.getByRole('complementary');
  const opened = performance.now();
  await panel.getByRole('button', { name: 'Buộc nộp…' }).click();
  const dialog = examiner.getByRole('dialog', { name: 'Buộc nộp' });
  await expect(dialog).toContainText(`Thí sinh Hoàn tác 1 (${project})`);
  await expect(dialog).toContainText(`UD-${letter}-001`);
  await expect(dialog).toContainText('hoàn tác được trong 10 phút');
  const openMs = performance.now() - opened;
  console.info(`[${project}] mở hộp Buộc nộp: ${openMs.toFixed(0)} ms`);
  expect(openMs, 'hộp Buộc nộp mở tức thì').toBeLessThan(1000);
  expect(await overflow(examiner), 'hộp Buộc nộp').toBe(0);

  // Tầng B: chưa gõ, gõ sai, gõ mã người khác: khóa; gõ đúng (không phân biệt hoa thường): mở.
  const confirm = dialog.getByRole('button', { name: /^Buộc nộp 1 người/ });
  await expect(confirm).toBeDisabled();
  const typed = dialog.getByLabel(/Gõ lại/);
  await typed.fill(`UD-${letter}-002`);
  await expect(confirm).toBeDisabled();
  await typed.fill(`ud-${letter.toLowerCase()}-001`);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(sv1.getByRole('heading', { name: 'Đã nộp' })).toBeVisible({
    timeout: PUSH_BUDGET_MS,
  });
  await expect(sv1.getByText(/Nếu bạn bị nộp nhầm/)).toBeVisible();
  // Người kia không bị ảnh hưởng.
  await expect(sv2.getByRole('timer', { name: 'Thời gian còn lại' })).toBeVisible();

  // Tầng A: dải nhắc và nút Hoàn tác có đếm lùi.
  await examiner.keyboard.press('Escape');
  const bar = examiner.getByRole('status').filter({ hasText: '1 người vừa bị Buộc nộp' });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(/Còn \d+:\d{2} để hoàn tác/);
  await openPerson(examiner, /Thí sinh Hoàn tác 1/);
  const undoPanel =
    project === 'mobile' ? examiner.getByRole('dialog') : examiner.getByRole('complementary');
  await expect(undoPanel.getByText(/Còn \d+:\d{2} để hoàn tác nếu bấm nhầm/)).toBeVisible();
  await undoPanel.getByRole('button', { name: 'Hoàn tác Buộc nộp', exact: true }).click();
  const undoDialog = examiner.getByRole('dialog', { name: 'Hoàn tác Buộc nộp' });
  await expect(undoDialog).toContainText('Thí sinh Hoàn tác 1');
  const undoAsked = performance.now();
  await undoDialog.getByRole('button', { name: 'Mở lại bài của 1 người' }).click();
  await expect(examiner.getByText('Đã mở lại bài của 1 người')).toBeVisible();
  const toast = performance.now() - undoAsked;

  // Người dự thi tự về đề, câu đã lưu còn nguyên, có dải thông báo.
  await expect(sv1.getByRole('timer', { name: 'Thời gian còn lại' })).toBeVisible({
    timeout: PUSH_BUDGET_MS,
  });
  const back = performance.now() - undoAsked;
  console.info(
    `[${project}] Hoàn tác: ${toast.toFixed(0)} ms đến thông báo, ${back.toFixed(0)} ms đến lúc Người dự thi về đề`,
  );
  expect(toast, 'Hoàn tác phản hồi tức thì').toBeLessThan(1000);
  await expect(sv1.getByRole('radio', { name: 'Hà Nội' })).toBeChecked();
  await expect(sv1.getByText('Người ra đề đã mở lại bài của bạn')).toBeVisible({ timeout: 20_000 });
  // Làm tiếp được: chọn đáp án khác rồi thấy "Đã lưu".
  await sv1.getByRole('radio', { name: 'Huế' }).check();
  await expect(sv1.getByRole('status', { name: 'Trạng thái lưu' })).toContainText('Đã lưu');

  // Màn Theo dõi: dải nhắc biến mất, người đó trở lại "Đang làm".
  await expect(bar).toHaveCount(0);
});

test('Buộc nộp nhóm gõ lại số người; Hoàn tác cả lô trong 10 phút qua', async ({
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const { examiner, sessionId, candidate } = await room(browser, project, 'V', {
    prefix: 'ud',
    fakeClock: false,
  });
  const sv1 = await candidate(1);
  const sv2 = await candidate(2);
  await openMonitor(examiner, sessionId);

  await examiner.getByRole('button', { name: 'Thao tác cả phòng' }).click();
  await examiner.getByRole('menuitem', { name: 'Buộc nộp cả phòng…' }).click();
  const dialog = examiner.getByRole('dialog', { name: 'Buộc nộp' });
  await expect(dialog).toContainText('Cả phòng: 2 người');
  const confirm = dialog.getByRole('button', { name: 'Buộc nộp 2 người' });
  await dialog.getByLabel(/Gõ lại/).fill('1');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Gõ lại/).fill('2');
  await confirm.click();
  for (const page of [sv1, sv2]) {
    await expect(page.getByRole('heading', { name: 'Đã nộp' })).toBeVisible({
      timeout: PUSH_BUDGET_MS,
    });
  }

  const bar = examiner.getByRole('status').filter({ hasText: '2 người vừa bị Buộc nộp' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: /Hoàn tác Buộc nộp \(2 người\)/ }).click();
  const undoDialog = examiner.getByRole('dialog', { name: 'Hoàn tác Buộc nộp' });
  await expect(undoDialog).toContainText('2 người');
  const asked = performance.now();
  await undoDialog.getByRole('button', { name: 'Mở lại bài của 2 người' }).click();
  await expect(examiner.getByText('Đã mở lại bài của 2 người')).toBeVisible();
  for (const page of [sv1, sv2]) {
    await expect(page.getByRole('timer', { name: 'Thời gian còn lại' })).toBeVisible({
      timeout: PUSH_BUDGET_MS,
    });
  }
  console.info(
    `[${project}] Hoàn tác cả lô 2 người: ${(performance.now() - asked).toFixed(0)} ms đến khi cả hai về đề`,
  );
  await expect(bar).toHaveCount(0);
});
