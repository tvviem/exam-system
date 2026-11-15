import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MailService } from '../src/modules/mail/mail.service';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { hours } from './support/fake-clock';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

// PR 7d-2, lát 9 (docs/plan/slice-7d-thiet-ke-kiem-thu.md K18): hạn mức thư hiển thị cho Người ra đề, màn Hàng đợi thư của
// Quản trị viên và chuông khi quá 70 % hạn mức. Số liệu lấy từ `email_outbox` thật và `planBatch` thật.

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ realMessageBuilder: true });
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  t.mail.reset();
});

async function signedIn(input: SeedUser) {
  const user = await seedUser(input);
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  return { ...user, cookie: cookie as string };
}
const get = (who: { cookie: string }, url: string) =>
  call(t.app, 'GET', url, { cookie: who.cookie });

interface Row {
  status?: 'pending' | 'sent' | 'rejected' | 'failed';
  lane?: 'urgent' | 'bulk';
  requestedBy?: string | null;
  to: string;
  createdAt?: Date;
  sentAt?: Date | null;
  kind?: string;
}
async function insertMail(row: Row) {
  const status = row.status ?? 'pending';
  const createdAt = row.createdAt ?? t.clock.now();
  await sql(
    `INSERT INTO email_outbox (id, kind, lane, to_email, status, requested_by, next_attempt_at, created_at, sent_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::mail_status, $5, $6, $6, $7)`,
    [
      row.kind ?? 'activation',
      row.lane ?? 'bulk',
      row.to,
      status,
      row.requestedBy ?? null,
      createdAt,
      status === 'sent' ? (row.sentAt ?? createdAt) : null,
    ],
  );
}

describe('hạn mức thư (K18)', () => {
  let admin: Awaited<ReturnType<typeof signedIn>>;
  let examiner: Awaited<ReturnType<typeof signedIn>>;
  let other: Awaited<ReturnType<typeof signedIn>>;

  beforeEach(async () => {
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
    examiner = await signedIn({ roleTags: ['examiner'], fullName: 'Lê Giảng Viên' });
    other = await signedIn({ roleTags: ['examiner'], fullName: 'Giảng Viên Hai' });
  });

  it('D-37: khung hạn mức: đã gửi 24 giờ, trần, số thư trước thư của bạn và giờ dự kiến xong (theo planBatch, xoay vòng giữa hai người)', async () => {
    const now = t.clock.now().getTime();
    // 2 thư đã gửi trong 24 giờ, 1 thư đã gửi 25 giờ trước (không tính), cách đây hơn 1 phút nên không vướng khoảng cách 6 giây.
    await insertMail({ status: 'sent', to: 'a@x.vn', sentAt: new Date(now - 120_000) });
    await insertMail({ status: 'sent', to: 'b@x.vn', sentAt: new Date(now - hours(2) * 1) });
    await insertMail({ status: 'sent', to: 'c@x.vn', sentAt: new Date(now - hours(25) * 1) });
    // Thứ tự tạo: O1, M1, O2, M2, M3. Xoay vòng: O1, M1, O2, M2, M3 → thư của mình đứng thứ 2, xong thư thứ 5.
    const at = (i: number) => new Date(now - 1000 * (10 - i));
    await insertMail({ to: 'o1@x.vn', requestedBy: other.id, createdAt: at(1) });
    await insertMail({ to: 'm1@x.vn', requestedBy: examiner.id, createdAt: at(2) });
    await insertMail({ to: 'o2@x.vn', requestedBy: other.id, createdAt: at(3) });
    await insertMail({ to: 'm2@x.vn', requestedBy: examiner.id, createdAt: at(4) });
    await insertMail({ to: 'm3@x.vn', requestedBy: examiner.id, createdAt: at(5) });

    const res = await get(examiner, '/api/account-support/quota');
    expect(res.statusCode, res.body).toBe(200);
    const q = res.json();
    expect(q).toMatchObject({
      sent24h: 2,
      totalLimit: 400,
      pendingTotal: 5,
      mine: { pending: 3, ahead: 1 },
    });
    // Mỗi thư cách nhau 6 giây: thư thứ 5 gửi sau 4 khoảng cách kể từ lúc đủ điều kiện (lần gửi gần nhất đã cách đây > 6 giây).
    expect(new Date(q.mine.estimatedDoneAt).getTime()).toBe(now + 4 * 6_000);
  });

  it('D-37b: không có thư chờ thì không có ước tính; Người dự thi bị chặn', async () => {
    const res = await get(examiner, '/api/account-support/quota');
    expect(res.json()).toMatchObject({
      pendingTotal: 0,
      mine: { pending: 0, ahead: 0, estimatedDoneAt: null },
    });
    const candidate = await signedIn({ roleTags: ['candidate'], fullName: 'Thí Sinh' });
    expect((await get(candidate, '/api/account-support/quota')).statusCode).toBe(403);
  });

  it('D-39: màn Hàng đợi thư của Quản trị viên: số theo trạng thái, 24 giờ so với trần, thư chưa gửi được; không hiện mã; chỉ Quản trị viên', async () => {
    const now = t.clock.now().getTime();
    await insertMail({ status: 'sent', to: 'ok@x.vn', sentAt: new Date(now - 60_000) });
    await insertMail({ status: 'rejected', to: 'sai@x.vn', requestedBy: examiner.id });
    await insertMail({ status: 'pending', to: 'cho@x.vn', requestedBy: examiner.id });

    const res = await get(admin, '/api/admin/mail-queue');
    expect(res.statusCode, res.body).toBe(200);
    const q = res.json();
    expect(q).toMatchObject({
      sent24h: 1,
      totalLimit: 400,
      counts: { pending: 1, rejected: 1, sent: 1 },
    });
    expect((q.items as { toEmail: string }[]).map((i) => i.toEmail).sort()).toEqual([
      'cho@x.vn',
      'sai@x.vn',
    ]);
    for (const item of q.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          'attemptCount',
          'createdAt',
          'id',
          'kind',
          'lane',
          'lastError',
          'status',
          'toEmail',
        ].sort(),
      );
    }
    expect(res.body).not.toMatch(/token|context|mat-khau/i);
    expect((await get(examiner, '/api/admin/mail-queue')).statusCode).toBe(403);
  });

  describe('chuông quá 70 % hạn mức (D-38)', () => {
    const bell = async (who: { cookie: string }) =>
      (
        (await get(who, '/api/notifications')).json().items as {
          type: string;
          readAt: string | null;
        }[]
      ).filter((n) => n.type === 'mail.quota_high');
    const fillSent = async (n: number) => {
      const now = t.clock.now().getTime();
      await sql(
        `INSERT INTO email_outbox (id, kind, lane, to_email, status, next_attempt_at, created_at, sent_at)
         SELECT gen_random_uuid(), 'password_reset', 'urgent', 'dong' || g || '@x.vn', 'sent', $1, $1, $1
           FROM generate_series(1, $2) g`,
        [new Date(now - 60_000), n],
      );
    };
    const check = async () => {
      await t.app.get(MailService).wake();
      await t.queue.drain();
    };

    it('vượt 280 thư trong 24 giờ thì mọi Quản trị viên có chuông, hạ xuống thì chuông tự gỡ', async () => {
      const admin2 = await signedIn({ isAdmin: true, fullName: 'Quản Trị Hai' });
      await fillSent(280);
      await check();
      expect(await bell(admin)).toEqual([]); // đúng 280 chưa vượt

      await fillSent(1);
      await check();
      expect(await bell(admin)).toHaveLength(1);
      expect(await bell(admin2)).toHaveLength(1);
      expect(await bell(examiner)).toEqual([]);

      t.clock.advance(hours(25)); // thư cũ ra khỏi cửa sổ 24 giờ
      await check();
      const fresh = {
        cookie: (await login(t.app, admin.username as string, DEFAULT_PASSWORD)).cookie as string,
      };
      const after = await bell(fresh);
      expect(after.every((n) => n.readAt !== null)).toBe(true);
    });

    it('mỗi ngày tối đa một chuông: chuông đã đọc không bị dựng lại trong cùng ngày', async () => {
      await fillSent(281);
      await check();
      const [first] = (await get(admin, '/api/notifications')).json().items as {
        id: string;
        type: string;
      }[];
      expect(first?.type).toBe('mail.quota_high');
      await call(t.app, 'POST', '/api/notifications/read', {
        cookie: admin.cookie,
        body: { ids: [first?.id] },
      });
      await check();
      await check();
      expect(await bell(admin)).toHaveLength(1);
      expect((await bell(admin))[0]?.readAt).not.toBeNull();
    });
  });
});
