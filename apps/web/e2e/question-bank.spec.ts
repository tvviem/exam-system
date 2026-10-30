import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  // Trang đăng nhập cũng có H1, nên phải chờ rời khỏi /login mới chắc là đã vào được.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Gõ vào một ô soạn (TipTap): bấm vào ô rồi gõ bằng bàn phím. */
async function typeIn(page: Page, name: string | RegExp, text: string) {
  const box = page.getByRole('textbox', { name });
  await box.click();
  await page.keyboard.type(text);
}

async function startQuestion(page: Page, typeLabel: string) {
  await page.getByRole('button', { name: 'Soạn câu hỏi' }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: new RegExp(`^${typeLabel}`) })
    .click();
  await expect(page.getByRole('heading', { name: 'Soạn câu hỏi', level: 1 })).toBeVisible();
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu Câu hỏi')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
}

test('Người ra đề tạo Chủ đề rồi soạn đủ 4 loại câu hỏi, tìm không dấu, nhân bản, chuyển và xóa', async ({
  page,
}, testInfo) => {
  await signIn(page, `e2e-ch-soan-${testInfo.project.name}`);
  await page.goto('/examiner/questions');
  await expect(page.getByRole('heading', { name: 'Ngân hàng câu hỏi', level: 1 })).toBeVisible();

  // --- Chủ đề ---
  await expect(page.getByText('Hãy tạo một Chủ đề trước khi soạn Câu hỏi.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Quản lý Chủ đề' }).click();
  const manager = page.getByRole('dialog');
  await manager.getByLabel('Tên Chủ đề').fill('Giải tích');
  await manager.getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(manager.getByText('Giải tích')).toBeVisible();
  await manager.getByLabel('Tên Chủ đề').fill('giai   TICH');
  await manager.getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(manager.getByText('Đã có Chủ đề trùng tên')).toBeVisible();
  await manager.getByLabel('Tên Chủ đề').fill('Đại số');
  await manager.getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(manager.getByText('Đại số')).toBeVisible();
  await manager.getByRole('button', { name: 'Đóng', exact: true }).last().click();

  // --- Chọn một ---
  await startQuestion(page, 'Chọn một');
  await typeIn(page, 'Phần dẫn', 'Đạo hàm của x² là gì?');
  await typeIn(page, 'Phương án A', 'x');
  await typeIn(page, 'Phương án B', '2x');
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled(); // chưa chọn đáp án
  await page.getByRole('radio', { name: /Phương án B/ }).check();
  await save(page);

  // --- Chọn nhiều ---
  await page.goto('/examiner/questions');
  await startQuestion(page, 'Chọn nhiều');
  await typeIn(page, 'Phần dẫn', 'Chọn các số nguyên tố');
  await typeIn(page, 'Phương án A', '2');
  await typeIn(page, 'Phương án B', '4');
  await page.getByRole('button', { name: 'Thêm Phương án' }).click();
  await typeIn(page, 'Phương án C', '7');
  await page.getByRole('checkbox', { name: /Phương án A/ }).check();
  await page.getByRole('checkbox', { name: /Phương án C/ }).check();
  await save(page);

  // --- Chùm đúng/sai (Bậc thang) ---
  await page.goto('/examiner/questions');
  await startQuestion(page, 'Chùm đúng/sai');
  await typeIn(page, 'Phần dẫn', 'Xét hàm số f(x) = x³');
  await typeIn(page, 'Mệnh đề a', 'f đồng biến trên R');
  await typeIn(page, 'Mệnh đề b', 'f có cực trị');
  await page.getByLabel('Cách chấm').selectOption('ladder');
  await expect(page.getByLabel('Đúng 1 Mệnh đề')).toHaveValue('0.5');
  await save(page);

  // --- Tự luận ---
  await page.goto('/examiner/questions');
  await startQuestion(page, 'Tự luận');
  await typeIn(page, 'Phần dẫn', 'Trình bày định nghĩa giới hạn');
  await typeIn(page, 'Hướng dẫn chấm', 'Nêu đủ định nghĩa ε-δ');
  await save(page);

  // --- Danh sách, tìm không dấu ---
  await page.goto('/examiner/questions');
  await expect(page.getByText('Đạo hàm của x² là gì?').filter({ visible: true })).toBeVisible();
  await page.getByLabel('Tìm câu hỏi').fill('dao ham');
  await expect(page.getByText('Chọn các số nguyên tố').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText('Đạo hàm của x² là gì?').filter({ visible: true })).toBeVisible();
  await page.getByLabel('Tìm câu hỏi').fill('không có chữ này');
  await expect(page.getByText('Chưa có Câu hỏi nào khớp.')).toBeVisible();
  await page.getByLabel('Tìm câu hỏi').fill('');

  // --- Nhân bản từ trình soạn ---
  await page.getByRole('link', { name: 'Chọn các số nguyên tố' }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Sửa câu hỏi', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Nhân bản' }).click();
  await expect(page.getByText('Đã nhân bản Câu hỏi')).toBeVisible();

  // --- Chuyển Chủ đề và xóa hàng loạt ---
  await page.goto('/examiner/questions');
  await page
    .getByRole('checkbox', { name: 'Chọn mọi câu trên trang' })
    .filter({ visible: true })
    .check();
  await expect(page.getByText('Đã chọn 5 câu')).toBeVisible();
  await page.getByRole('button', { name: 'Chuyển Chủ đề' }).click();
  await page.getByLabel('Chủ đề đích').selectOption({ label: 'Đại số' });
  await page.getByRole('dialog').getByRole('button', { name: 'Chuyển Chủ đề' }).click();
  await expect(page.getByText('Đã chuyển 5 Câu hỏi')).toBeVisible();

  await page
    .getByRole('checkbox', { name: 'Chọn mọi câu trên trang' })
    .filter({ visible: true })
    .check();
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(page.getByText('Đã xóa 5 Câu hỏi')).toBeVisible();
  await expect(page.getByText('Chưa có Câu hỏi nào khớp.')).toBeVisible();
});

test('bản đang soạn được nhớ trên thiết bị và rời trang đang sửa dở thì có cảnh báo', async ({
  page,
}, testInfo) => {
  await signIn(page, `e2e-ch-rong-${testInfo.project.name}`);
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Quản lý Chủ đề' }).click();
  await page.getByRole('dialog').getByLabel('Tên Chủ đề').fill('Tạm');
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(page.getByRole('dialog').getByText('Tạm', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).last().click();

  await startQuestion(page, 'Tự luận');
  await typeIn(page, 'Phần dẫn', 'Đang soạn dở');

  // Rời trang: hộp xác nhận; từ chối thì ở lại.
  let asked = false;
  page.once('dialog', async (dialog) => {
    asked = true;
    await dialog.dismiss();
  });
  await page.getByRole('link', { name: 'Ngân hàng câu hỏi' }).first().click();
  await expect.poll(() => asked).toBe(true);
  await expect(page.getByRole('heading', { name: 'Soạn câu hỏi', level: 1 })).toBeVisible();

  // Bản nháp được ghi sau 400 ms; tải lại trang thì được đề nghị khôi phục.
  await page.waitForTimeout(700);
  page.once('dialog', (dialog) => dialog.accept()); // beforeunload
  await page.reload();
  await expect(page.getByText('Có bản nháp chưa lưu của câu hỏi này trên thiết bị.')).toBeVisible();
  await page.getByRole('button', { name: 'Khôi phục' }).click();
  await expect(page.getByRole('textbox', { name: 'Phần dẫn' })).toContainText('Đang soạn dở');
});

// Q107: điểm gãy chuẩn, các trang mới không được cuộn ngang.
for (const width of [360, 768, 1024, 1440]) {
  test(`trang Ngân hàng câu hỏi và trình soạn không cuộn ngang ở ${width} px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, `e2e-ch-rong-${testInfo.project.name}`);
    for (const path of ['/examiner/questions', '/examiner/questions/new?type=true_false_cluster']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} cuộn ngang ở ${width} px`).toBe(0);
    }
  });
}

// Trình soạn đo bề rộng vùng nội dung (không phải màn hình): đủ rộng thì Soạn và Xem thử đứng cạnh nhau,
// hẹp thì là hai tab; ẩn thanh bên nới thêm chỗ nên laptop 1024 px cũng chia cột được.
test('trình soạn chia cột Soạn / Xem thử theo chỗ còn lại, ẩn thanh bên thì nới thêm', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'bố cục máy tính');
  await signIn(page, `e2e-ch-rong-${testInfo.project.name}`);
  const tabs = page.getByRole('tablist', { name: 'Soạn hoặc xem thử' });
  const editor = page.getByRole('textbox', { name: 'Phần dẫn' });
  const preview = page.getByRole('heading', { name: 'Xem thử' });

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/examiner/questions/new?type=single_choice');
  await expect(editor).toBeVisible();
  await expect(tabs).toBeVisible();
  await expect(preview).toBeHidden();

  await page.getByRole('button', { name: 'Ẩn thanh điều hướng' }).click();
  await expect(tabs).toBeHidden();
  const [stem, view] = await Promise.all([editor.boundingBox(), preview.boundingBox()]);
  expect(stem && view && view.x > stem.x + stem.width - 1).toBe(true);
  expect(stem?.width).toBeGreaterThan(450);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Hiện thanh điều hướng' }).click();
  await expect(tabs).toBeHidden();
  const wide = await editor.boundingBox();
  expect(wide?.width).toBeGreaterThan(500);
});

// Công thức toán (Q121, Q127–Q131): chèn bằng hộp thoại MathLive, hiện bằng KaTeX, lưu và mở lại vẫn còn.
test('chèn công thức vào Phần dẫn, xem thử, lưu, mở lại và sửa', async ({ page }, testInfo) => {
  await signIn(page, `e2e-ch-cthuc-${testInfo.project.name}`);
  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Quản lý Chủ đề' }).click();
  const manager = page.getByRole('dialog');
  await manager.getByLabel('Tên Chủ đề').fill('Giải tích');
  await manager.getByRole('button', { name: 'Thêm Chủ đề' }).click();
  await expect(manager.getByText('Giải tích')).toBeVisible();
  await manager.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await startQuestion(page, 'Chọn một');

  const setFormula = (latex: string) =>
    page.evaluate((value) => {
      const field = document.querySelector('math-field') as HTMLElement & { value: string };
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }, latex);
  const stem = page.getByRole('textbox', { name: 'Phần dẫn' });
  await typeIn(page, 'Phần dẫn', 'Tính ');
  await page
    .getByRole('toolbar', { name: /Phần dẫn/ })
    .getByRole('button', { name: 'Công thức' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Chèn công thức' });
  await expect(dialog.locator('math-field')).toBeVisible();

  // công thức sai thì không chèn được
  await setFormula('\\frac{1}{');
  await expect(dialog.getByText('Công thức chưa đúng')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Chèn công thức' })).toBeDisabled();
  await setFormula('\\href{https://x.y}{a}');
  await expect(dialog.getByText('lệnh không được phép')).toBeVisible();

  await setFormula('\\frac{1}{2}');
  await dialog.getByRole('button', { name: 'Chèn công thức' }).click();
  await expect(stem.locator('.katex')).toHaveCount(1);
  await typeIn(page, 'Phương án A', 'x');
  await typeIn(page, 'Phương án B', 'y');
  await page.getByRole('radio', { name: /Phương án B/ }).check();
  await expect(page.locator('article .katex')).toHaveCount(1); // cột Xem thử (hoặc tab) cũng dựng công thức
  await save(page);

  await page.reload();
  await expect(stem.locator('.katex')).toHaveCount(1);
  await stem.getByRole('button', { name: /Công thức .*frac/ }).click();
  const edit = page.getByRole('dialog', { name: 'Sửa công thức' });
  await expect(edit.locator('math-field')).toBeVisible();
  await setFormula('x^2');
  await edit.getByRole('button', { name: 'Lưu công thức' }).click();
  await expect(stem.getByRole('button', { name: /Công thức x\^2/ })).toBeVisible();
  await save(page);
});

// Công thức dài không được làm vỡ bố cục ở các điểm gãy chuẩn: trang không cuộn ngang, công thức nằm trong khung
// (công thức quá rộng tự cuộn bên trong), và trên màn cảm ứng nút sửa công thức đủ lớn để chạm.
for (const width of [360, 768, 1024, 1440]) {
  test(`câu hỏi có công thức dài hiển thị gọn ở ${width} px`, async ({ page }, testInfo) => {
    await signIn(page, `e2e-ch-cthuc-${testInfo.project.name}`);
    const formula = (latex: string, display = false) => ({
      type: 'math',
      attrs: { latex, display },
    });
    const long = `${Array.from({ length: 14 }, (_, i) => `a_{${i + 1}}`).join(' + ')} = \\frac{n(n+1)}{2}`;
    const doc = (...content: unknown[]) => ({ type: 'doc', content });
    const para = (...content: unknown[]) => ({ type: 'paragraph', content });
    const text = (value: string) => ({ type: 'text', text: value });
    const headers = { origin: 'http://localhost:4173' }; // server chặn yêu cầu ghi không có Origin
    const topic = await page.request.post('/api/topics', {
      headers,
      data: { name: `Công thức ${width} ${testInfo.project.name}` },
    });
    const created = await page.request.post('/api/questions', {
      headers,
      data: {
        type: 'multiple_choice',
        topicId: (await topic.json()).id,
        stem: doc(
          para(text('Cho tổng '), formula(long), text(' với mọi số tự nhiên n.')),
          para(formula(`${long} + ${long}`, true)),
        ),
        defaultPoints: 1,
        tags: [],
        payload: {
          options: [
            { id: 'o1', content: doc(para(text('Bằng '), formula(long))) },
            { id: 'o2', content: doc(para(formula('\\frac{1}{2}'))) },
          ],
          key: ['o1'],
          scoringRule: 'proportional',
          shuffleOptions: false,
        },
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const { id } = await created.json();

    await page.setViewportSize({ width, height: 900 });
    for (const path of [`/examiner/questions/${id}`, '/examiner/questions']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (path.endsWith(id)) await expect(page.locator('.katex').first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} cuộn ngang ở ${width} px`).toBe(0);
    }

    await page.goto(`/examiner/questions/${id}`);
    await expect(page.locator('[data-math]').first()).toBeVisible();
    const hosts = await page.locator('[data-math]:visible').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { right: box.right, left: box.left };
      }),
    );
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(host.left).toBeGreaterThanOrEqual(0);
      expect(host.right).toBeLessThanOrEqual(width);
    }

    if (testInfo.project.name === 'mobile') {
      const button = page.getByRole('button', { name: /Công thức .*frac\{1\}\{2\}/ }).first();
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  });
}

// Thanh Lưu trên laptop gọn như thanh nổi về bên phải, không trải hết chiều ngang.
test('thanh Lưu của trình soạn trên laptop gọn và nằm bên phải', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'bố cục máy tính');
  await signIn(page, `e2e-ch-rong-${testInfo.project.name}`);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/examiner/questions/new?type=single_choice');
  const save = page.getByRole('button', { name: 'Lưu' });
  await expect(save).toBeVisible();
  const [button, main] = await Promise.all([
    save.boundingBox(),
    page.getByRole('main').boundingBox(),
  ]);
  const bar = await save.locator('xpath=ancestor::div[contains(@class,"sticky")][1]').boundingBox();
  expect(bar && main && bar.width < main.width / 2).toBe(true);
  expect(bar && main && bar.x + bar.width > main.x + main.width - 40).toBe(true);
  expect(button?.width).toBeLessThan(260);
});

// Nhiều Chủ đề: hộp Quản lý gọn một dòng mỗi Chủ đề, tìm không dấu, tách Đang dùng / Đã lưu trữ, menu "…" đủ hành động.
test('quản lý nhiều Chủ đề: tìm, lưu trữ, khôi phục qua menu; cột lọc có ô tìm hoặc ô chọn', async ({
  page,
}, testInfo) => {
  await signIn(page, `e2e-ch-nhieu-${testInfo.project.name}`);
  const headers = { origin: 'http://localhost:4173' };
  const names = Array.from({ length: 30 }, (_, i) => `Chuyên đề ${String(i + 1).padStart(2, '0')}`);
  names[4] = 'Đạo hàm nâng cao';
  const ids: string[] = [];
  for (const name of names) {
    const res = await page.request.post('/api/topics', { headers, data: { name } });
    ids.push((await res.json()).id);
  }
  // một Chủ đề có câu hỏi (không xóa được)
  const q = (
    await page.request.post('/api/questions', {
      headers,
      data: {
        type: 'essay',
        topicId: ids[0],
        stem: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Câu tự luận' }] }],
        },
        defaultPoints: 1,
        tags: [],
        payload: { maxLength: 500 },
      },
    })
  ).ok();
  expect(q).toBe(true);

  await page.goto('/examiner/questions');
  await page.getByRole('button', { name: 'Quản lý Chủ đề' }).click();
  const manager = page.getByRole('dialog', { name: 'Quản lý Chủ đề' });
  await expect(manager.getByRole('button', { name: /^Đang dùng \(30\)/ })).toBeVisible();
  await expect(manager.getByText('Lưu trữ cất Chủ đề khỏi bộ lọc')).toBeVisible();

  // tìm không dấu
  await manager.getByLabel('Tìm Chủ đề').fill('dao ham');
  await expect(manager.getByText('Đạo hàm nâng cao')).toBeVisible();
  await expect(manager.getByText('Chuyên đề 01')).toHaveCount(0);
  await manager.getByLabel('Tìm Chủ đề').fill('khong co');
  await expect(manager.getByText('Không có Chủ đề nào khớp')).toBeVisible();

  // lưu trữ qua menu, chuyển sang nhóm Đã lưu trữ rồi khôi phục
  await manager.getByLabel('Tìm Chủ đề').fill('dao ham');
  await manager.getByRole('button', { name: 'Thao tác với Chủ đề Đạo hàm nâng cao' }).click();
  await page.getByRole('menuitem', { name: 'Lưu trữ' }).click();
  await expect(manager.getByText('Đạo hàm nâng cao')).toHaveCount(0);
  await expect(manager.getByRole('button', { name: /^Đã lưu trữ \(1\)/ })).toBeVisible();
  await manager.getByRole('button', { name: /^Đã lưu trữ/ }).click();
  await manager.getByRole('button', { name: 'Thao tác với Chủ đề Đạo hàm nâng cao' }).click();
  await page.getByRole('menuitem', { name: 'Khôi phục' }).click();
  await expect(manager.getByRole('button', { name: /^Đang dùng \(30\)/ })).toBeVisible();

  // Chủ đề còn câu hỏi: mục Xóa bị khóa và có giải thích; Esc đóng menu nhưng không đóng hộp thoại
  await manager.getByRole('button', { name: /^Đang dùng/ }).click();
  await manager.getByLabel('Tìm Chủ đề').fill('chuyen de 01');
  await manager.getByRole('button', { name: 'Thao tác với Chủ đề Chuyên đề 01' }).click();
  await expect(page.getByRole('menuitem', { name: /Xóa/ })).toBeDisabled();
  await expect(page.getByText('Chủ đề còn Câu hỏi nên chưa xóa được')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(manager).toBeVisible();
  await manager.getByRole('button', { name: 'Đóng', exact: true }).last().click();

  // cột lọc: laptop có ô tìm Chủ đề, điện thoại là ô chọn
  if (testInfo.project.name === 'mobile') {
    await expect(page.getByLabel('Chủ đề', { exact: true })).toBeVisible();
  } else {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByLabel('Tìm Chủ đề').fill('dao ham');
    await expect(page.getByRole('button', { name: /Đạo hàm nâng cao/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Chuyên đề 01/ })).toHaveCount(0);
  }
});
