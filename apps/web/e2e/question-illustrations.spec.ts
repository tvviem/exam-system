import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function typeIn(page: Page, name: string | RegExp, text: string) {
  await page.getByRole('textbox', { name }).click();
  await page.keyboard.type(text);
}

async function createTopic(page: Page) {
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Quản lý Chủ đề' }).click();
  const manager = page.getByRole('dialog');
  await manager.getByLabel('Tên Chủ đề').fill('Hình học');
  await manager.getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(manager.getByText('Hình học')).toBeVisible();
  await manager.getByRole('button', { name: 'Đóng', exact: true }).last().click();
}

async function startQuestion(page: Page) {
  await page.getByRole('button', { name: 'Soạn câu hỏi' }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /^Chọn một/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Soạn câu hỏi', level: 1 })).toBeVisible();
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Câu hỏi')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
}

/** Dựng ảnh JPEG/PNG ngay trong trình duyệt, để test không phải mang file ảnh theo. */
async function makeImage(page: Page, width: number, height: number, type: string) {
  const base64 = await page.evaluate(
    async ({ width, height, type }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const g = canvas.getContext('2d');
      if (!g) throw new Error('Không có canvas');
      const gradient = g.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#2563eb');
      gradient.addColorStop(1, '#f59e0b');
      g.fillStyle = gradient;
      g.fillRect(0, 0, width, height);
      let seed = 7;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < 600; i++) {
        g.fillStyle = `hsl(${rnd() * 360} 70% 50%)`;
        g.beginPath();
        g.arc(rnd() * width, rnd() * height, 20 + rnd() * 120, 0, 7);
        g.fill();
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.95));
      const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
      let text = '';
      for (const byte of bytes) text += String.fromCharCode(byte);
      return btoa(text);
    },
    { width, height, type },
  );
  return Buffer.from(base64, 'base64');
}

test('chèn hình minh họa: tải ảnh lớn, bắt buộc mô tả, xem thử, lưu, mở lại, phóng to và sửa mô tả', async ({
  page,
}, testInfo) => {
  await signIn(page, `e2e-ch-anh-${testInfo.project.name}`);
  await createTopic(page);
  await startQuestion(page);

  const photo = await makeImage(page, 3200, 2400, 'image/jpeg');
  await typeIn(page, 'Phần dẫn', 'Cho đồ thị như hình. ');
  await page
    .getByRole('toolbar', { name: /Phần dẫn/ })
    .getByRole('button', { name: 'Hình minh họa' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Chèn hình minh họa' });
  const uploaded = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/illustrations'),
  );
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'do-thi.jpg', mimeType: 'image/jpeg', buffer: photo });
  // Ảnh được thu nhỏ trên trình duyệt trước khi gửi (Q142).
  const sent = Number((await (await uploaded).allHeaders())['content-length']);
  expect(sent).toBeGreaterThan(0);
  expect(sent).toBeLessThan(photo.length);

  const alt = dialog.getByLabel('Mô tả hình (bắt buộc)');
  await expect(alt).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Chèn hình', exact: true })).toBeDisabled();
  await alt.fill('Đồ thị hàm số bậc hai');
  await expect(dialog.getByRole('button', { name: 'Chèn hình', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Chèn hình', exact: true }).click();

  const stem = page.getByRole('textbox', { name: 'Phần dẫn' });
  await expect(stem.getByRole('img', { name: 'Đồ thị hàm số bậc hai' })).toBeVisible();
  // Gõ tiếp sau khi chèn: chữ nằm sau ảnh, không ghi đè ảnh.
  await page.keyboard.type('Hết.');
  await expect(stem.getByRole('img', { name: 'Đồ thị hàm số bậc hai' })).toBeVisible();
  await expect(stem).toContainText('Hết.');
  await typeIn(page, 'Phương án A', 'a');
  await typeIn(page, 'Phương án B', 'b');
  await page.getByRole('radio', { name: /Phương án B/ }).check();
  await expect(page.locator('article img[alt="Đồ thị hàm số bậc hai"]')).toHaveCount(1); // cột Xem thử (hoặc tab)
  await save(page);

  // Mở lại: ảnh tải được, cỡ không vượt 1600 px (biến thể lớn nhất).
  await page.reload();
  const picture = page.getByRole('textbox', { name: 'Phần dẫn' }).getByRole('img');
  await expect(picture).toBeVisible();
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeLessThanOrEqual(
    1600,
  );

  // Phóng to ở khu xem thử (điện thoại: sang tab Xem thử).
  const previewTab = page.getByRole('tab', { name: 'Xem thử' });
  if (await previewTab.count()) await previewTab.click();
  await page
    .locator('article')
    .getByRole('button', { name: /Xem hình lớn/ })
    .click();
  const zoom = page.getByRole('dialog', { name: 'Hình minh họa' });
  await expect(zoom.getByRole('img')).toBeVisible();
  await zoom.getByRole('button', { name: 'Đóng', exact: true }).first().click();

  // Sửa mô tả (điện thoại: về tab Soạn).
  const editTab = page.getByRole('tab', { name: 'Soạn' });
  if (await editTab.count()) await editTab.click();
  await page
    .getByRole('textbox', { name: 'Phần dẫn' })
    .getByRole('button', { name: /Hình minh họa: Đồ thị/ })
    .click();
  const edit = page.getByRole('dialog', { name: 'Sửa hình minh họa' });
  await edit.getByLabel('Mô tả hình (bắt buộc)').fill('Parabol đi qua gốc tọa độ');
  await edit.getByRole('button', { name: 'Lưu mô tả' }).click();
  await expect(
    page
      .getByRole('textbox', { name: 'Phần dẫn' })
      .getByRole('img', { name: 'Parabol đi qua gốc tọa độ' }),
  ).toBeVisible();
  await save(page);
});

test('dùng lại ảnh trong thư viện, xóa ảnh chưa dùng, từ chối file không phải ảnh', async ({
  page,
}, testInfo) => {
  await signIn(page, `e2e-ch-anh-${testInfo.project.name}`);
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Soạn câu hỏi' }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /^Chọn một/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Soạn câu hỏi', level: 1 })).toBeVisible();

  const stemToolbar = page.getByRole('toolbar', { name: /Phần dẫn/ });
  await stemToolbar.getByRole('button', { name: 'Hình minh họa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Chèn hình minh họa' });

  // File chữ đổi đuôi: server từ chối, hộp thoại báo lỗi và vẫn ở bước chọn ảnh.
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'ghi-chu.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('không phải ảnh'),
  });
  await expect(dialog.getByText('Chỉ nhận ảnh JPEG, PNG hoặc WebP.')).toBeVisible();

  // Ảnh từ bài trước có trong thư viện; ảnh đang được Câu hỏi dùng không xóa được.
  const library = dialog.getByRole('region', { name: 'Ảnh đã tải lên của tôi' });
  await expect(library.getByRole('button', { name: 'Chọn ảnh này' })).toHaveCount(1);
  await expect(library.getByRole('button', { name: 'Xóa ảnh khỏi thư viện' })).toBeDisabled();

  // Tải thêm ảnh nhỏ (giữ nguyên, không thu nhỏ), rồi xóa nó khỏi thư viện.
  const small = await makeImage(page, 300, 200, 'image/png');
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'nho.png', mimeType: 'image/png', buffer: small });
  await expect(dialog.getByLabel('Mô tả hình (bắt buộc)')).toBeVisible();
  await dialog.getByRole('button', { name: 'Chọn ảnh khác' }).click();
  await expect(library.getByRole('button', { name: 'Chọn ảnh này' })).toHaveCount(2);
  await library.getByRole('button', { name: 'Xóa ảnh khỏi thư viện' }).first().click();
  await library.getByRole('button', { name: 'Xóa ảnh', exact: true }).click();
  await expect(library.getByRole('button', { name: 'Chọn ảnh này' })).toHaveCount(1);

  // Chọn lại ảnh có sẵn.
  await library.getByRole('button', { name: 'Chọn ảnh này' }).click();
  await dialog.getByLabel('Mô tả hình (bắt buộc)').fill('Dùng lại');
  await dialog.getByRole('button', { name: 'Chèn hình', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Phần dẫn' }).getByRole('img', { name: 'Dùng lại' }),
  ).toBeVisible();
});

// Đã lưu rồi thì rời trang không được hỏi "Có thay đổi chưa lưu": kiểm cả lúc vừa tạo, sau khi mở lại và sau khi sửa.
test('câu hỏi có hình đã lưu: quay về danh sách không bị hỏi "Có thay đổi chưa lưu"', async ({
  page,
}, testInfo) => {
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await signIn(page, `e2e-ch-anh-${testInfo.project.name}`);
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Quản lý Chủ đề' }).click();
  const manager = page.getByRole('dialog');
  await manager.getByLabel('Tên Chủ đề').fill('Rời trang');
  await manager.getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(manager.getByText('Rời trang')).toBeVisible();
  await manager.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await startQuestion(page);

  const photo = await makeImage(page, 800, 600, 'image/png');
  await typeIn(page, 'Phần dẫn', 'Xem hình. ');
  await page
    .getByRole('toolbar', { name: /Phần dẫn/ })
    .getByRole('button', { name: 'Hình minh họa' })
    .click();
  const picker = page.getByRole('dialog', { name: 'Chèn hình minh họa' });
  await picker
    .locator('input[type=file]')
    .setInputFiles({ name: 'hinh.png', mimeType: 'image/png', buffer: photo });
  await picker.getByLabel('Mô tả hình (bắt buộc)').fill('Hình thử');
  await picker.getByRole('button', { name: 'Chèn hình', exact: true }).click();
  await typeIn(page, 'Phương án A', 'a');
  await typeIn(page, 'Phương án B', 'b');
  await page.getByRole('radio', { name: /Phương án B/ }).check();
  await save(page);

  const backToList = async (step: string) => {
    await page.getByRole('link', { name: 'Ngân hàng câu hỏi' }).first().click();
    // Nếu bị hỏi, hộp thoại đã bị bỏ qua nên trang không đổi: báo lỗi nêu rõ câu hỏi thay vì chờ phần tử.
    await expect.poll(() => dialogs.length === 0 || `${step}: ${dialogs[0]}`).toBe(true);
    await expect(page.getByRole('button', { name: 'Soạn câu hỏi' })).toBeVisible();
  };

  // 1. Vừa tạo xong (trang chuyển sang "Sửa câu hỏi").
  await backToList('ngay sau khi tạo');
  expect(dialogs, 'ngay sau khi tạo').toEqual([]);

  // 2. Mở lại câu đã lưu rồi quay về mà không sửa gì.
  await page.getByText('Xem hình.').locator('visible=true').first().click();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Phần dẫn' }).getByRole('img')).toBeVisible();
  await backToList('mở lại, không sửa');
  expect(dialogs, 'mở lại, không sửa').toEqual([]);

  // 3. Sửa rồi lưu, quay về.
  await page.getByText('Xem hình.').locator('visible=true').first().click();
  await typeIn(page, 'Phương án A', ' sửa');
  await save(page);
  await backToList('sau khi sửa và lưu');
  expect(dialogs, 'sau khi sửa và lưu').toEqual([]);
});
