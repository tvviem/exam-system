import { expect, test } from '@playwright/test';
import { examinerPage, overflow, seedOpenSession, signIn } from './take-support';

// Rà UX sau bản 0.5.1 (docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md): U4 trang đầu của Người ra đề, U5 màn "Vào thi" không lặp nhãn.

test('Người ra đề đăng nhập xong vào trang Phiên thi (việc hằng ngày), không phải form xin cấp tài khoản', async ({
  page,
}, testInfo) => {
  await signIn(page, `e2e-uxa-gv-${testInfo.project.name}`);
  await expect(page).toHaveURL(/\/examiner\/sessions/);
  await expect(page.getByRole('heading', { name: 'Phiên thi', level: 1 })).toBeVisible();
  // Mục Yêu cầu cấp tài khoản vẫn có trên thanh điều hướng
  await expect(
    page
      .getByRole('link', { name: /^Yêu cầu/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  // Vào thẳng /examiner cũng về Phiên thi
  await page.goto('/examiner');
  await expect(page).toHaveURL(/\/examiner\/sessions/);
});

test('Vào thi: nhãn trạng thái không lặp tiêu đề nhóm, bỏ câu nhắc thừa, nút "Nhập mã" đưa con trỏ vào ô nhập', async ({
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const examiner = await examinerPage(browser, `e2e-uxa-gv-${p}`);
  await seedOpenSession(examiner, `${p}-uxa-vt-mo`, `UXAVTM${tag}`, `UXA-${tag}-001`);
  // Phiên thi sắp mở trong 10 phút: nằm trong cửa sổ 30 phút nên nhập mã vào Phòng chờ sớm được
  await seedOpenSession(examiner, `${p}-uxa-vt-sap`, `UXAVTS${tag}`, `UXA-${tag}-001`, {
    opensInMs: 10 * 60_000,
  });

  const page = await (await browser.newContext(testInfo.project.use)).newPage();
  await signIn(page, `e2e-uxa-sv-${p}`);
  await page.goto('/take');
  await expect(page.getByRole('heading', { name: 'Đang mở', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sắp mở', level: 2 })).toBeVisible();

  // Nhãn trạng thái lặp tiêu đề nhóm đã bị bỏ: "Đang mở" và "Sắp mở" chỉ còn là tiêu đề nhóm
  await expect(page.getByText('Đang mở', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Sắp mở', { exact: true })).toHaveCount(1);
  // Phiên thi đang mở: không còn câu nhắc, nút "Nhập mã" là đủ
  await expect(page.getByText('Nhập Mã vào thi để vào.')).toHaveCount(0);
  // Phiên thi sắp mở: lời nhắc có giờ mở và việc vào Phòng chờ sớm được giữ
  await expect(page.getByText(/Đã nhập được Mã vào thi để vào Phòng chờ/)).toBeVisible();

  // Nút "Nhập mã" của đúng thẻ: đưa con trỏ vào ô nhập; điện thoại: rộng gần trọn thẻ
  const card = page.locator('li').filter({
    has: page.getByRole('heading', { name: `Ca làm bài ${p}-uxa-vt-mo`, level: 3 }),
  });
  const button = card.getByRole('button', { name: 'Nhập mã' });
  await expect(button).toHaveCount(1);
  if (p === 'mobile') {
    const cardBox = await card.boundingBox();
    const box = await button.boundingBox();
    expect(box?.width ?? 0, 'nút Nhập mã trọn hàng').toBeGreaterThan((cardBox?.width ?? 400) * 0.8);
  }
  await button.click();
  await expect(page.getByLabel('Mã vào thi')).toBeFocused();
  expect(await overflow(page), 'tràn ngang').toBe(0);
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/vao-thi-${p}.png`, fullPage: true });
});
