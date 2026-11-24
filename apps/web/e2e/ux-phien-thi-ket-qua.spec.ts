import { expect, test } from '@playwright/test';
import { examinerPage, overflow, seedOpenSession } from './take-support';

// Rà UX sau bản 0.5.1 (docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md, U2 và U3): Phiên thi > Tổng quan và trang Kết quả,
// trên điện thoại và máy tính. Đo bằng kích thước thật, không so ảnh.

const shot = (page: import('@playwright/test').Page, name: string, p: string) =>
  process.env.SHOTS
    ? page.screenshot({ path: `${process.env.SHOTS}/${name}-${p}.png`, fullPage: true })
    : undefined;

test('Phiên thi > Tổng quan: Mã vào thi đứng đầu, thông tin gọn, các tab đều một dòng', async ({
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const examiner = await examinerPage(browser, `e2e-uxa-gv-${p}`);
  const code = `UXAOV${tag}`;
  const sessionId = await seedOpenSession(examiner, `${p}-uxa-ov`, code, `UXA-${tag}-001`);
  await examiner.goto(`/examiner/sessions/${sessionId}`);

  // Mã vào thi nằm ngay đầu nội dung (trong nửa trên màn hình), cạnh nút Sao chép, có lời nhắc dùng ở đâu
  const card = examiner.getByTestId('access-code-card');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('access-code')).toHaveText(code);
  await expect(card.getByRole('button', { name: 'Sao chép' })).toBeVisible();
  await expect(card).toContainText('Người dự thi nhập mã này ở trang Vào thi');
  const viewport = examiner.viewportSize();
  const top = (await card.boundingBox())?.y ?? 9999;
  expect(top, 'Mã vào thi phải nằm trong nửa trên màn hình').toBeLessThan(
    (viewport?.height ?? 800) * 0.6,
  );
  // Mã chỉ xuất hiện một lần trong trang (không còn dòng riêng ở cuối)
  await expect(examiner.getByTestId('access-code')).toHaveCount(1);

  // Các tab: mỗi tab một dòng (không xuống dòng), cùng chiều cao, tên ngắn "Danh sách"
  const tabs = examiner.getByRole('tab');
  await expect(examiner.getByRole('tab', { name: 'Danh sách' })).toBeVisible();
  const heights = await tabs.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().height)),
  );
  expect(new Set(heights).size, `chiều cao các tab ${heights}`).toBe(1);
  expect(heights[0]).toBeLessThanOrEqual(56);
  expect(await overflow(examiner), 'tràn ngang').toBe(0);

  if (p === 'mobile') {
    // Lưới hai cột: Thời lượng và Số Lượt làm bài đứng cạnh nhau, không mỗi thứ một hàng
    const a = await examiner.getByText('Thời lượng', { exact: true }).boundingBox();
    const b = await examiner
      .getByText('Cắt cứng khi đóng Khung giờ', { exact: true })
      .boundingBox();
    expect(Math.abs((a?.y ?? 0) - (b?.y ?? 99))).toBeLessThan(8);
  }
  await shot(examiner, 'phien-thi-tong-quan', p);
});

test('Kết quả: một nút chính, nút phụ gọn, Phiên thi chưa ai làm không có dòng điểm thừa', async ({
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const tag = p === 'desktop' ? 'D' : 'M';
  const examiner = await examinerPage(browser, `e2e-uxa-gv-${p}`);
  const sessionId = await seedOpenSession(examiner, `${p}-uxa-kq`, `UXAKQ${tag}`, `UXA-${tag}-001`);
  await examiner.goto(`/examiner/sessions/${sessionId}/results`);

  // Chưa có bài tự luận chờ chấm: Công bố là nút chính (đặc), Chấm tự luận là nút phụ
  const release = examiner.getByRole('button', { name: 'Công bố kết quả' });
  const grade = examiner.getByRole('link', { name: /Chấm tự luận/ });
  await expect(release).toBeVisible();
  await expect(grade).toBeVisible();
  const bg = (loc: import('@playwright/test').Locator) =>
    loc.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg(release), 'Công bố là nút chính').not.toBe(await bg(grade));

  if (p === 'mobile') {
    const box = await release.boundingBox();
    const card = await examiner
      .getByRole('heading', { name: /Ca làm bài/ })
      .first()
      .boundingBox();
    expect(box?.width ?? 0, 'nút chính trọn hàng').toBeGreaterThan(
      (viewportWidth(examiner) ?? 390) * 0.8,
    );
    // nút chính lên đầu nhóm nút
    expect((box?.y ?? 0) < (await grade.boundingBox().then((g) => g?.y ?? 0))).toBe(true);
    expect(card).not.toBeNull();
  }
  // Mọi nút đủ lớn để bấm bằng ngón tay
  const minSide = p === 'mobile' ? 44 : 32;
  for (const loc of [
    release,
    grade,
    examiner.getByRole('button', { name: /Chấm ẩn tên/ }),
    examiner.getByRole('link', { name: 'Xuất Excel' }),
  ]) {
    const b = await loc.boundingBox();
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(minSide);
  }

  // Tab "Vi phạm": chưa có Vi phạm chưa quyết thì chỉ ghi "Vi phạm", không kèm "(0 chưa quyết)"
  const violations = examiner.getByRole('tab', { name: /^Vi phạm/ });
  await expect(violations).toHaveText('Vi phạm');
  const tabHeights = await examiner
    .getByRole('tab')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  expect(new Set(tabHeights).size, `chiều cao các tab ${tabHeights}`).toBe(1);

  // Người chưa làm bài: thẻ là một vùng bấm, chỉ có nhãn "Chưa làm bài", không có dòng "Điểm thô —"
  if (p === 'mobile') {
    const person = examiner.getByTestId('person-card').first();
    await expect(person).toContainText('Chưa làm bài');
    await expect(person).not.toContainText('Điểm thô');
    expect((await person.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  // Phần giải thích "Cho xem lại đề" gập lại, mở bằng nút có chữ
  await expect(examiner.getByText(/Nên tắt nếu bạn dùng lại đề/)).toBeHidden();
  await examiner.getByRole('button', { name: 'Xem giải thích' }).click();
  await expect(examiner.getByText(/Nên tắt nếu bạn dùng lại đề/)).toBeVisible();
  expect(await overflow(examiner), 'tràn ngang').toBe(0);
  await shot(examiner, 'ket-qua', p);
});

function viewportWidth(page: import('@playwright/test').Page) {
  return page.viewportSize()?.width;
}
