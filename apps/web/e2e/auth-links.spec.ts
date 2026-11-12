import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// PR 7c-1, K6 (docs/plan/slice-7c-thiet-ke-kiem-thu.md): ba trang kích hoạt, đặt lại và quên mật khẩu trên trình duyệt.
// Người dùng Chờ kích hoạt và mã được chèn thẳng vào database E2E (cùng cách backup.spec.ts); phía API đã có bài trọn kịch bản
// ở apps/api/test/auth-links*.int.test.ts và auth-recovery.int.test.ts.
const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const { Client } = apiRequire('pg');
const { hashPassword } = apiRequire('./dist/modules/identity/password/password-hasher.js');
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://exam:exam@127.0.0.1:5434/exam_e2e';
const PASSWORD_MOI = 'hoa-sen-no-sang-moi';

type Purpose = 'activation' | 'password_reset';
interface Seed {
  purpose?: Purpose;
  pending?: boolean;
  expiresInMinutes?: number;
  usedMinutesAgo?: number;
  replaced?: boolean;
  locked?: boolean;
}

/** Dựng người dùng và một mã đã biết; trả về tên đăng nhập và mã. */
async function seed(project: string, label: string, options: Seed = {}) {
  const username = `e2e-lk-${label}-${project}`.toLowerCase();
  const token = randomBytes(32).toString('base64url');
  const pending = options.pending ?? true;
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const { rows } = await db.query(
      `INSERT INTO users (id, username, email, full_name, password_hash, must_change_password, status, activated_at, email_verified_at)
       VALUES (gen_random_uuid(), $1, $2, 'Nguyễn Văn An', $3, false, $4, $5, $5) RETURNING id`,
      [
        username,
        `${username}@example.com`,
        pending ? null : await hashPassword('mat-khau-cu-rat-dai'),
        options.locked ? 'locked' : 'active',
        pending ? null : new Date(),
      ],
    );
    await db.query(
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, used_at, replaced_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, now() + make_interval(mins => $4),
               CASE WHEN $5::int IS NULL THEN NULL ELSE now() - make_interval(mins => $5::int) END,
               CASE WHEN $6 THEN now() ELSE NULL END, now())`,
      [
        rows[0].id,
        options.purpose ?? 'activation',
        createHash('sha256').update(token).digest('hex'),
        options.expiresInMinutes ?? 60 * 24 * 7,
        options.usedMinutesAgo ?? null,
        options.replaced ?? false,
      ],
    );
  } finally {
    await db.end();
  }
  return { username, token };
}

test('E-01: kích hoạt trọn vẹn: mở liên kết, đặt mật khẩu hai lần, không tự đăng nhập, rồi đăng nhập được', async ({
  page,
}, testInfo) => {
  const { username, token } = await seed(testInfo.project.name, 'kich-hoat');
  await page.goto(`/activate#${token}`);

  await expect(page.getByRole('heading', { name: 'Kích hoạt tài khoản' })).toBeVisible();
  await page.getByLabel('Mật khẩu mới').fill(PASSWORD_MOI);
  await page.getByLabel('Nhập lại mật khẩu').fill(PASSWORD_MOI);
  await page.getByRole('button', { name: 'Kích hoạt' }).click();

  await expect(page.getByRole('heading', { name: 'Đã kích hoạt tài khoản' })).toBeVisible();
  // Không tự đăng nhập: chưa vào được trang trong, phải đăng nhập.
  await page.getByRole('link', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD_MOI);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/login/);
});

test('E-02: mã bị xóa khỏi thanh địa chỉ sau khi đọc, và trang không gửi Referer', async ({
  page,
}, testInfo) => {
  const { token } = await seed(testInfo.project.name, 'dia-chi');
  await page.goto(`/activate#${token}`);
  await expect(page.getByRole('heading', { name: 'Kích hoạt tài khoản' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  expect(page.url()).not.toContain(token);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  // Tải lại thì không còn mã: trang báo không hợp lệ thay vì giữ mã trong lịch sử.
  await page.reload();
  await expect(page.getByText('Liên kết không hợp lệ')).toBeVisible();
});

test('E-03: liên kết đặt lại mật khẩu: mật khẩu yếu bị báo lỗi ngay tại ô, đặt đúng thì thành công', async ({
  page,
}, testInfo) => {
  const { token } = await seed(testInfo.project.name, 'dat-lai', {
    purpose: 'password_reset',
    pending: false,
  });
  await page.goto(`/reset-password#${token}`);
  await expect(page.getByRole('heading', { name: 'Đặt lại mật khẩu' })).toBeVisible();
  await page.getByLabel('Mật khẩu mới').fill('ngan123');
  await page.getByLabel('Nhập lại mật khẩu').fill('ngan123');
  await page.getByRole('button', { name: 'Đặt mật khẩu mới' }).click();
  await expect(page.getByRole('alert')).toContainText('ít nhất 10 ký tự');
  await page.getByLabel('Mật khẩu mới').fill(PASSWORD_MOI);
  await page.getByLabel('Nhập lại mật khẩu').fill(PASSWORD_MOI);
  await page.getByRole('button', { name: 'Đặt mật khẩu mới' }).click();
  await expect(page.getByRole('heading', { name: 'Đã đặt lại mật khẩu' })).toBeVisible();
});

test('E-03b: hai ô mật khẩu khác nhau thì báo ngay, không gửi', async ({ page }, testInfo) => {
  const { token } = await seed(testInfo.project.name, 'khac-nhau');
  await page.goto(`/activate#${token}`);
  await page.getByLabel('Mật khẩu mới').fill(PASSWORD_MOI);
  await page.getByLabel('Nhập lại mật khẩu').fill('khac-hoan-toan-xyz');
  await expect(page.getByText('Hai mật khẩu chưa giống nhau')).toBeVisible();

  // Bấm nút khi hai ô khác nhau thì KHÔNG gửi yêu cầu nào, mã vẫn còn nguyên.
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/links/consume')) sent.push(request.url());
  });
  await page.getByRole('button', { name: 'Kích hoạt' }).click();
  await page.waitForTimeout(300);
  expect(sent).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Kích hoạt tài khoản' })).toBeVisible();
});

test.describe('E-04: mỗi trạng thái của liên kết một trang riêng, nêu lý do và việc làm tiếp (TC 14)', () => {
  test('hết hạn: nêu giờ hết hạn và nút dẫn tới Quên mật khẩu', async ({ page }, testInfo) => {
    const { token } = await seed(testInfo.project.name, 'het-han', {
      purpose: 'password_reset',
      pending: false,
      expiresInMinutes: -5,
    });
    await page.goto(`/reset-password#${token}`);
    await expect(page.getByRole('heading', { name: 'Liên kết đã hết hạn' })).toBeVisible();
    await expect(page.getByText(/hết hạn lúc \d{2}:\d{2} ngày \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await page.getByRole('link', { name: 'Yêu cầu liên kết mới' }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test('đã dùng', async ({ page }, testInfo) => {
    const { token } = await seed(testInfo.project.name, 'da-dung', { usedMinutesAgo: 30 });
    await page.goto(`/activate#${token}`);
    await expect(page.getByRole('heading', { name: 'Liên kết đã được dùng' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
  });

  test('bị thay bằng thư mới hơn', async ({ page }, testInfo) => {
    const { token } = await seed(testInfo.project.name, 'bi-thay', { replaced: true });
    await page.goto(`/activate#${token}`);
    await expect(page.getByRole('heading', { name: 'Liên kết đã được thay' })).toBeVisible();
    await expect(page.getByText('thư mới nhất')).toBeVisible();
  });

  test('tài khoản đang bị khóa', async ({ page }, testInfo) => {
    const { token } = await seed(testInfo.project.name, 'bi-khoa', { locked: true });
    await page.goto(`/activate#${token}`);
    await expect(page.getByRole('heading', { name: 'Tài khoản chưa dùng được' })).toBeVisible();
  });

  test('không nhận ra', async ({ page }) => {
    await page.goto('/activate#ma-khong-ton-tai-0123456789abcdefghijklmnopqrst');
    await expect(page.getByRole('heading', { name: 'Liên kết không hợp lệ' })).toBeVisible();
  });
});

test('E-05: trang Quên mật khẩu trả cùng một câu cho tài khoản có và không có', async ({
  page,
}, testInfo) => {
  const { username } = await seed(testInfo.project.name, 'quen', { pending: false });
  const texts: string[] = [];
  for (const identifier of [username, `khong-co-${Date.now()}`]) {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Quên mật khẩu?' }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await page.getByLabel('Tên đăng nhập hoặc email').fill(identifier);
    await page.getByRole('button', { name: 'Gửi hướng dẫn' }).click();
    const notice = page.getByRole('status');
    await expect(notice).toContainText('Nếu tài khoản tồn tại');
    texts.push((await notice.textContent()) ?? '');
  }
  expect(texts[0]).toBe(texts[1]);
});

test('E-06: ba trang không cuộn ngang ở điện thoại hẹp', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 700 });
  const { token } = await seed(testInfo.project.name, 'hep');
  for (const url of [`/activate#${token}`, '/forgot-password', '/reset-password#ma-gia']) {
    await page.goto(url);
    await expect(page.getByRole('main')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
});
