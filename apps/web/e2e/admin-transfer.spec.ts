import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'mat-khau-on-dinh';
const ORIGIN = 'http://localhost:4173'; // server chặn yêu cầu ghi không có Origin

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

const rich = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

/** Người ra đề (đang đăng nhập trên `page`) tạo một Chủ đề có một Câu hỏi, qua API cho nhanh. */
async function seedTopic(page: Page, name: string) {
  const headers = { origin: ORIGIN };
  const topic = await page.request.post('/api/topics', { headers, data: { name } });
  expect(topic.ok(), await topic.text()).toBe(true);
  const topicId = (await topic.json()).id;
  const question = await page.request.post('/api/questions', {
    headers,
    data: {
      type: 'single_choice',
      topicId,
      stem: rich(`Câu của ${name}`),
      defaultPoints: 1,
      tags: [],
      payload: {
        options: [
          { id: 'o1', content: rich('a') },
          { id: 'o2', content: rich('b') },
        ],
        key: ['o1'],
        shuffleOptions: true,
      },
    },
  });
  expect(question.ok(), await question.text()).toBe(true);
  return (await question.json()).id as string;
}

async function openUser(page: Page, search: string, name: RegExp) {
  await page.goto('/admin/users');
  await page.getByRole('searchbox', { name: 'Tìm Người dùng' }).fill(search);
  await expect(page).toHaveURL(/q=/);
  await page.getByRole('link', { name }).first().click();
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('Quản trị viên chuyển giao một Chủ đề; người nhận thấy Chủ đề và thông báo', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const topicA = `Giải tích CG ${p}`;
  const topicB = `Đại số CG ${p}`;

  const donor = await browser.newContext({ baseURL: ORIGIN });
  const donorPage = await donor.newPage();
  await signIn(donorPage, `e2e-cg-cu-${p}`);
  await seedTopic(donorPage, topicA);
  await seedTopic(donorPage, topicB);
  await donor.close();

  await signIn(page, `e2e-cg-qt-${p}`);
  await openUser(page, `cu mot ${p}`, new RegExp(`Cũ Một ${p}`));
  await expect(page.getByRole('heading', { name: 'Nội dung', level: 2 })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: `Chọn Chủ đề ${topicB}` })).toBeVisible();
  expect(await noHorizontalScroll(page), 'trang người dùng').toBe(0);

  // Chưa chọn Chủ đề nào thì chưa chuyển giao được.
  const action = page.getByRole('button', { name: 'Chuyển giao…' });
  await expect(action).toBeDisabled();
  await page.getByRole('checkbox', { name: `Chọn Chủ đề ${topicA}` }).check();
  await action.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('1 Chủ đề, 1 câu hỏi, 0 ảnh')).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Chuyển giao', exact: true });
  await expect(confirm).toBeDisabled(); // chưa chọn người nhận
  await dialog.getByLabel('Tìm Người ra đề theo tên hoặc tên đăng nhập').fill(`Mới Nhận ${p}`);
  await dialog.getByRole('radio', { name: new RegExp(`Mới Nhận ${p}`) }).check();
  expect(await noHorizontalScroll(page), 'hộp thoại chuyển giao').toBe(0);
  await confirm.click();
  await expect(dialog.getByRole('status')).toHaveText(
    `Đã chuyển giao 1 Chủ đề (1 câu hỏi) cho Mới Nhận ${p}.`,
  );
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).first().click();

  // Chủ đề đã chuyển không còn ở người cho; Chủ đề kia vẫn còn.
  await expect(page.getByRole('checkbox', { name: `Chọn Chủ đề ${topicA}` })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: `Chọn Chủ đề ${topicB}` })).toBeVisible();

  // Người nhận thấy Chủ đề và thông báo.
  const recipient = await browser.newContext({ baseURL: ORIGIN });
  const recipientPage = await recipient.newPage();
  await signIn(recipientPage, `e2e-cg-moi-${p}`);
  await recipientPage.goto('/examiner/questions');
  await expect(recipientPage.getByText(topicA).locator('visible=true').first()).toBeVisible();
  await recipientPage.getByRole('button', { name: /^Thông báo \(1 chưa đọc\)/ }).click();
  await expect(
    recipientPage.getByText('Quản trị viên đã chuyển giao 1 Chủ đề cho bạn.'),
  ).toBeVisible();
  await recipient.close();
});

test('Xóa người dùng còn Chủ đề: chọn người nhận, chuyển giao và xóa cùng lúc', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const topic = `Hình học CG ${p}`;

  const donor = await browser.newContext({ baseURL: ORIGIN });
  const donorPage = await donor.newPage();
  await signIn(donorPage, `e2e-cg-cu2-${p}`);
  await seedTopic(donorPage, topic);
  await donor.close();

  await signIn(page, `e2e-cg-qt-${p}`);
  await openUser(page, `cu hai ${p}`, new RegExp(`Cũ Hai ${p}`));
  await page.getByRole('button', { name: 'Xóa người dùng' }).click();
  // Hộp xác nhận thường; api báo còn Chủ đề thì chuyển sang bước chọn người nhận.
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa người dùng' }).click();

  const dialog = page.getByRole('dialog', { name: `Xóa Cũ Hai ${p} và chuyển giao nội dung` });
  await expect(dialog.getByText('1 Chủ đề, 1 câu hỏi, 0 ảnh')).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Chuyển giao và xóa' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Tìm Người ra đề theo tên hoặc tên đăng nhập').fill(`Mới Nhận ${p}`);
  await dialog.getByRole('radio', { name: new RegExp(`Mới Nhận ${p}`) }).check();
  expect(await noHorizontalScroll(page), 'hộp thoại xóa').toBe(0);
  await confirm.click();
  await expect(dialog.getByRole('status')).toHaveText(
    `Đã chuyển giao 1 Chủ đề cho Mới Nhận ${p} và xóa tài khoản.`,
  );
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).first().click();
  await expect(page.getByText('Đã xóa', { exact: true }).first()).toBeVisible();

  const recipient = await browser.newContext({ baseURL: ORIGIN });
  const recipientPage = await recipient.newPage();
  await signIn(recipientPage, `e2e-cg-moi-${p}`);
  await recipientPage.goto('/examiner/questions');
  await expect(recipientPage.getByText(topic).locator('visible=true').first()).toBeVisible();
  await recipient.close();
});

test('chuyển hết Chủ đề: hộp thoại vẫn báo kết quả dù thẻ Nội dung đã trống', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const donor = await browser.newContext({ baseURL: ORIGIN });
  const donorPage = await donor.newPage();
  await signIn(donorPage, `e2e-cg-cu3-${p}`);
  await seedTopic(donorPage, `Duy nhất CG ${p}`);
  await donor.close();

  await signIn(page, `e2e-cg-qt-${p}`);
  await openUser(page, `cu ba ${p}`, new RegExp(`Cũ Ba ${p}`));
  await page.getByRole('checkbox', { name: 'Chọn tất cả Chủ đề' }).check();
  await page.getByRole('button', { name: 'Chuyển giao…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tìm Người ra đề theo tên hoặc tên đăng nhập').fill(`Mới Nhận ${p}`);
  await dialog.getByRole('radio', { name: new RegExp(`Mới Nhận ${p}`) }).check();
  await dialog.getByRole('button', { name: 'Chuyển giao', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText(
    `Đã chuyển giao 1 Chủ đề (1 câu hỏi) cho Mới Nhận ${p}.`,
  );
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).first().click();
  await expect(page.getByText('Người này không còn Chủ đề nào.')).toBeVisible();
});

test('Chuyển giao Chủ đề mang theo Bộ đề nháp; người nhận thấy Bộ đề và thông báo', async ({
  page,
  browser,
}, testInfo) => {
  const p = testInfo.project.name;
  const topic = `Bộ đề CG ${p}`;
  const donor = await browser.newContext({ baseURL: ORIGIN });
  const donorPage = await donor.newPage();
  await signIn(donorPage, `e2e-cg-cu4-${p}`);
  const questionId = await seedTopic(donorPage, topic);
  const headers = { origin: ORIGIN };
  const created = await (
    await donorPage.request.post('/api/exams', { headers, data: { title: `Đề CG ${p}` } })
  ).json();
  const saved = await donorPage.request.put(`/api/exams/${created.id}`, {
    headers,
    data: {
      title: `Đề CG ${p}`,
      instructions: emptyDoc,
      version: created.version,
      sections: [
        {
          id: created.sections[0].id,
          title: null,
          instructions: emptyDoc,
          items: [{ questionId, points: 1 }],
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await donor.close();

  await signIn(page, `e2e-cg-qt-${p}`);
  await openUser(page, `cu bon ${p}`, new RegExp(`Cũ Bốn ${p}`));
  await page.getByRole('checkbox', { name: `Chọn Chủ đề ${topic}` }).check();
  await page.getByRole('button', { name: 'Chuyển giao…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText('1 Bộ đề nháp có câu của các Chủ đề này sẽ chuyển theo'),
  ).toBeVisible();
  await dialog.getByLabel('Tìm Người ra đề theo tên hoặc tên đăng nhập').fill(`Nhận Bộ đề ${p}`);
  await dialog.getByRole('radio', { name: new RegExp(`Nhận Bộ đề ${p}`) }).check();
  expect(await noHorizontalScroll(page), 'hộp thoại chuyển giao').toBe(0);
  await dialog.getByRole('button', { name: 'Chuyển giao', exact: true }).click();
  await expect(dialog.getByText('1 Bộ đề đã chuyển theo.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).first().click();

  const recipient = await browser.newContext({ baseURL: ORIGIN });
  const recipientPage = await recipient.newPage();
  await signIn(recipientPage, `e2e-cg-nbd-${p}`);
  await recipientPage.goto('/examiner/exams');
  await expect(recipientPage.getByRole('link', { name: new RegExp(`Đề CG ${p}`) })).toBeVisible();
  await recipientPage.getByRole('button', { name: /^Thông báo \(1 chưa đọc\)/ }).click();
  await expect(
    recipientPage.getByText('Quản trị viên đã chuyển giao 1 Chủ đề và 1 Bộ đề cho bạn.'),
  ).toBeVisible();
  await recipient.close();
});
