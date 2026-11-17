import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { seedOpenSession } from './take-support';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const { Client } = apiRequire('pg');
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://exam:exam@127.0.0.1:5434/exam_e2e';
const PASSWORD = 'mat-khau-on-dinh';

/** Đẩy các thư của những email này lùi 25 giờ: không còn là thư "vừa gửi" (luật B, 17/11/2026). */
async function ageMailsOf(suffix: string) {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query(
      "UPDATE email_outbox SET created_at = created_at - interval '25 hours', sent_at = sent_at - interval '25 hours' WHERE to_email LIKE $1",
      [`%${suffix}`],
    );
  } finally {
    await db.end();
  }
}

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

// PR 7d-2, lát 10 (E-04, E-06, E-07): Người ra đề theo dõi kích hoạt ở trang Yêu cầu, gửi lại, sửa email, tạo liên kết hỗ trợ.
test('Người ra đề theo dõi kích hoạt của Yêu cầu đã duyệt: khung hạn mức, Gửi lại cho tất cả, Sửa email, Liên kết hỗ trợ', async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const fileName = `theo-doi-${project}.csv`;
  const csv = [
    'Họ tên,Mã định danh,Email,Lớp,Ngày sinh,Giới tính',
    `Nguyễn Văn An,TD-${project}-1,an.td.${project}@example.edu.vn,K21,,`,
    `Trần Thị Bình,TD-${project}-2,binh.td.${project}@example.edu.vn,K21,,`,
    `Lê Văn Chi,TD-${project}-3,chi.td.${project}@example.edu.vn,K21,,`,
  ].join('\n');

  // Người ra đề gửi Yêu cầu, Quản trị viên duyệt.
  await signIn(page, `e2e-td-gv-${project}`);
  await page.goto('/examiner/account-requests');
  await page.getByLabel('File danh sách').setInputFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(page.getByText('Chờ duyệt').first()).toBeVisible({ timeout: 15_000 });

  const admin = await browser.newPage();
  await signIn(admin, `e2e-td-qt-${project}`);
  await admin.goto('/admin/account-requests');
  await admin.getByRole('link', { name: new RegExp(fileName) }).click();
  await admin.getByRole('button', { name: /^Duyệt 3 dòng sẵn sàng$/ }).click();
  await expect(admin.getByText('Đã duyệt', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await admin.close();

  // Người ra đề thấy bảng theo dõi.
  await page.reload();
  const board = page.getByRole('region', { name: 'Theo dõi kích hoạt' });
  await expect(board).toBeVisible({ timeout: 15_000 });
  await expect(board.getByText(/Đã gửi \d+\/400 thư trong 24 giờ/)).toBeVisible();
  await expect(board.getByText('Nguyễn Văn An').filter({ visible: true })).toBeVisible();
  await expect(board.getByText('Lê Văn Chi').filter({ visible: true })).toBeVisible();
  // Bộ lọc nhóm "Chờ kích hoạt" đếm cả ba người.
  await expect(board.getByRole('button', { name: /^Chờ kích hoạt \(3\)$/ })).toBeVisible();

  // Gửi lại cho tất cả ngay sau khi duyệt: cả ba vừa nhận thư tạo tài khoản nên KHÔNG gửi thêm (thư mới làm liên kết cũ hết hiệu lực).
  await board.getByRole('button', { name: 'Gửi lại cho tất cả' }).click();
  await expect(page.getByText(/Đã xếp 0 thư, bỏ qua 3 người/)).toBeVisible();
  await expect(page.getByText(/3 người vừa được gửi thư kích hoạt trong 24 giờ qua/)).toBeVisible();
  // Sau 24 giờ thì gửi lại được; lần hai trong 6 giờ bị từ chối.
  await ageMailsOf(`.td.${project}@example.edu.vn`);
  await board.getByRole('button', { name: 'Gửi lại cho tất cả' }).click();
  await expect(page.getByText(/Đã xếp 3 thư/)).toBeVisible();
  await board.getByRole('button', { name: 'Gửi lại cho tất cả' }).click();
  await expect(board.getByRole('alert')).toBeVisible();

  // Sửa email một người (lý do bắt buộc).
  await board
    .getByRole('button', { name: 'Sửa email của Nguyễn Văn An' })
    .filter({ visible: true })
    .click();
  const change = page.getByRole('dialog');
  await change.getByLabel('Email mới').fill(`an.moi.${project}@example.edu.vn`);
  await change.getByLabel('Lý do').fill('Sinh viên báo gõ nhầm email');
  await change.getByRole('button', { name: 'Sửa email', exact: true }).click();
  await expect(
    board.getByText(`an.moi.${project}@example.edu.vn`).filter({ visible: true }),
  ).toBeVisible();

  // Liên kết hỗ trợ: hiện một lần, có nút sao chép.
  await board
    .getByRole('button', { name: 'Liên kết hỗ trợ của Trần Thị Bình' })
    .filter({ visible: true })
    .click();
  const linkDialog = page.getByRole('dialog');
  await linkDialog.getByLabel('Lý do').fill('Thư không tới, sinh viên có mặt');
  await linkDialog.getByRole('button', { name: 'Tạo liên kết' }).click();
  expect(await linkDialog.getByLabel('Liên kết hỗ trợ').inputValue()).toMatch(
    /\/activate#[\w-]{30,}$/,
  );
  await expect(linkDialog.getByRole('note')).toContainText('chỉ hiện một lần');
  await linkDialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();

  // E-05: Danh sách dự thi của Phiên thi hiện dấu "chưa kích hoạt" và hai việc hỗ trợ trong menu của dòng.
  const tag = project === 'desktop' ? 'D' : 'M';
  const sessionId = await seedOpenSession(page, `td-${project}`, `TDE2E${tag}`, `TD-${project}-3`);
  await page.goto(`/examiner/sessions/${sessionId}`);
  await page.getByRole('tab', { name: 'Danh sách dự thi' }).click();
  const rosterRow = page.getByRole('listitem').filter({ hasText: 'Lê Văn Chi' });
  await expect(rosterRow.getByText(/Chưa gửi thư|Đã gửi thư/)).toBeVisible();
  // Danh sách vẽ lại khi dữ liệu theo dõi về, có thể đóng menu vừa mở: thử lại như các bài khác.
  await expect(async () => {
    await rosterRow.getByRole('button', { name: 'Thao tác với Lê Văn Chi' }).click();
    await expect(page.getByRole('menuitem', { name: 'Sửa email…' })).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole('menuitem', { name: 'Liên kết hỗ trợ…' })).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 20_000 });
  await page.keyboard.press('Escape');

  // Không cuộn ngang (E-07).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

// E-04b: Quản trị viên xem màn Hàng đợi thư (số theo trạng thái, 24 giờ so với trần).
test('Quản trị viên mở màn Hàng đợi thư từ thanh điều hướng', async ({ page }, testInfo) => {
  await signIn(page, `e2e-td-qt-${testInfo.project.name}`);
  await page.goto('/admin');
  await page.goto('/admin/mail-queue');
  await expect(page.getByRole('heading', { name: 'Hàng đợi thư', level: 1 })).toBeVisible();
  await expect(page.getByText(/Đã gửi \d+\/400 thư trong 24 giờ/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
