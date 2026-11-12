import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// PR 7c-2b, K13 (docs/plan/slice-7c2-thiet-ke-kiem-thu.md): mục Email ở trang Tài khoản và trang /verify-email#mã. Người dùng và mã
// được chèn thẳng vào database E2E (như auth-links.spec.ts); phía API đã có bài ở apps/api/test/account-email.int.test.ts.
const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const { Client } = apiRequire('pg');
const { hashPassword } = apiRequire('./dist/modules/identity/password/password-hasher.js');
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://exam:exam@127.0.0.1:5434/exam_e2e';
const PASSWORD = 'mat-khau-on-dinh';

interface Seed {
  /** Không đặt sẵn mã (bài tự đặt sau khi worker xử lý xong thư). */
  noToken?: boolean;
  verified?: boolean;
  newEmail?: string;
  expiresInMinutes?: number;
  usedMinutesAgo?: number;
  replaced?: boolean;
}

/** Người dùng Hoạt động có email và một mã đổi email đã biết. */
async function seed(project: string, label: string, options: Seed = {}) {
  const username = `e2e-em-${label}-${project}`.toLowerCase();
  const email = `${username}@example.com`;
  const token = randomBytes(32).toString('base64url');
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const { rows } = await db.query(
      `INSERT INTO users (id, username, email, full_name, password_hash, must_change_password, status, activated_at, email_verified_at)
       VALUES (gen_random_uuid(), $1, $2, 'Nguyễn Văn An', $3, false, 'active', now(), $4) RETURNING id`,
      [username, email, await hashPassword(PASSWORD), options.verified ? new Date() : null],
    );
    if (!options.noToken) {
      await db.query(
        `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, new_email, expires_at, used_at, replaced_at, created_at)
       VALUES (gen_random_uuid(), $1, 'email_change', $2, $3, now() + make_interval(mins => $4),
               CASE WHEN $5::int IS NULL THEN NULL ELSE now() - make_interval(mins => $5::int) END,
               CASE WHEN $6 THEN now() ELSE NULL END, now())`,
        [
          rows[0].id,
          createHash('sha256').update(token).digest('hex'),
          options.newEmail ?? email,
          options.expiresInMinutes ?? 60 * 24,
          options.usedMinutesAgo ?? null,
          options.replaced ?? false,
        ],
      );
    }
  } finally {
    await db.end();
  }
  return { username, email, token };
}

/** Chờ worker xử lý xong thư gửi tới `email` rồi đặt một mã đã biết cho người đó. */
async function addTokenAfterMail(email: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await expect
      .poll(
        async () =>
          (
            await db.query(
              `SELECT count(*)::int AS n FROM email_outbox WHERE to_email = $1 AND status IN ('sent','skipped')`,
              [email],
            )
          ).rows[0].n,
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    await db.query(
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, new_email, expires_at, created_at)
       SELECT gen_random_uuid(), id, 'email_change', $2, email, now() + interval '1 day', now() FROM users WHERE email = $1`,
      [email, createHash('sha256').update(token).digest('hex')],
    );
  } finally {
    await db.end();
  }
  return token;
}

async function signIn(page: import('@playwright/test').Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test('E-01: mục Email: hiện địa chỉ và trạng thái; "Gửi thư xác thực" báo đã gửi; bấm liên kết thì thành Đã xác thực', async ({
  page,
}, testInfo) => {
  const { username, email } = await seed(testInfo.project.name, 'xac-thuc', { noToken: true });
  await signIn(page, username);
  await page.goto('/account');

  const section = page.getByRole('region', { name: 'Email' });
  await expect(section.getByText(email)).toBeVisible();
  await expect(section.getByText('Chưa xác thực', { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Gửi thư xác thực' }).click();
  await expect(section.getByRole('status')).toContainText(`Đã gửi thư xác thực tới ${email}`);

  // Mở liên kết trong thư (mã đã biết, đặt sau khi worker xử lý thư): chưa đổi gì cho tới khi bấm nút.
  const token = await addTokenAfterMail(email);
  await page.goto(`/verify-email#${token}`);
  await expect(page.getByRole('heading', { name: 'Xác nhận email' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.getByRole('button', { name: 'Xác nhận email' }).click();
  await expect(page.getByRole('heading', { name: 'Đã xác nhận email' })).toBeVisible();

  await page.goto('/account');
  await expect(
    page.getByRole('region', { name: 'Email' }).getByText('Đã xác thực', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Email' }).getByRole('button', { name: 'Gửi thư xác thực' }),
  ).toHaveCount(0);
});

test('E-02: Đổi email: sai mật khẩu hiện tại báo lỗi tại ô; đúng thì báo đã gửi thư và email CHƯA đổi', async ({
  page,
}, testInfo) => {
  const { username, email } = await seed(testInfo.project.name, 'doi', { verified: true });
  await signIn(page, username);
  await page.goto('/account');
  const section = page.getByRole('region', { name: 'Email' });

  await section.getByLabel('Email mới').fill(`moi-${username}@example.com`);
  await section.getByLabel('Mật khẩu hiện tại để đổi email').fill('mat-khau-sai-hoan-toan');
  await section.getByRole('button', { name: 'Gửi thư xác nhận' }).click();
  await expect(section.getByRole('alert')).toContainText('Mật khẩu hiện tại không đúng');

  await section.getByLabel('Mật khẩu hiện tại để đổi email').fill(PASSWORD);
  await section.getByRole('button', { name: 'Gửi thư xác nhận' }).click();
  await expect(section.getByRole('status')).toContainText(
    `Đã gửi thư xác nhận tới moi-${username}@example.com`,
  );
  await expect(section.getByText(email, { exact: true })).toBeVisible(); // chưa đổi cho tới khi bấm liên kết
});

test('E-03: trang /verify-email: mỗi trạng thái một trang, nêu lý do và việc làm tiếp', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const cases: [string, Seed, string][] = [
    ['het-han', { expiresInMinutes: -5 }, 'Liên kết đã hết hạn'],
    ['da-dung', { usedMinutesAgo: 30 }, 'Liên kết đã được dùng'],
    ['bi-thay', { replaced: true }, 'Liên kết đã được thay'],
  ];
  for (const [label, options, heading] of cases) {
    const { token } = await seed(project, label, options);
    await page.goto(`/verify-email#${token}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  await page.goto('/verify-email#ma-khong-ton-tai-0123456789abcdefghijklmnopqrst');
  await expect(page.getByRole('heading', { name: 'Liên kết không hợp lệ' })).toBeVisible();
  await page.getByRole('link', { name: 'Về trang Tài khoản' }).click();
  await expect(page).toHaveURL(/\/login|\/account/);
});

test('E-03b: địa chỉ đã có người khác dùng trong lúc chờ thì báo rõ, không đổi', async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const other = await seed(project, 'nguoi-khac', { verified: true });
  const { token } = await seed(project, 'bi-lay', { newEmail: other.email });
  await page.goto(`/verify-email#${token}`);
  await page.getByRole('button', { name: 'Xác nhận email' }).click();
  await expect(
    page.getByRole('heading', { name: 'Địa chỉ email này đã có người dùng' }),
  ).toBeVisible();
});

test('E-05: trang Tài khoản (mục Email) và trang xác nhận không cuộn ngang ở điện thoại hẹp', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 700 });
  const { username, token } = await seed(testInfo.project.name, 'hep');
  await page.goto(`/verify-email#${token}`);
  await expect(page.getByRole('main')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await signIn(page, username);
  await page.goto('/account');
  await expect(page.getByRole('region', { name: 'Email' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
