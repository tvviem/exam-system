import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DISPATCH_LOCK_KEY } from '../src/modules/mail/mail.config';
import { MailService } from '../src/modules/mail/mail.service';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { captureLogs } from './support/capture-logs';
import { sql } from './support/db';
import { hours, minutes, seconds } from './support/fake-clock';
import { TEST_SMTP_SECRET } from './support/fake-mail';
import { resetState } from './support/reset';
import { seedUser } from './support/users';

// PR 7b, hạ tầng gửi email (docs/plan/slice-7b-thiet-ke-kiem-thu.md). Mọi bài đi qua giao diện công khai của
// `MailService` cộng `FakeMailTransport` ở biên; không kiểm xuyên vào bảng (trừ khi chính bảng là hành vi).

let t: TestApp;
let mail: MailService;

/** Chạy job gửi như worker làm mỗi phút (cron), không qua việc `enqueue` kích. */
const runDispatch = () => t.app.get(JobRegistry).run('mail.dispatch', {});

beforeAll(async () => {
  t = await createTestApp();
  mail = t.app.get(MailService);
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  // Bài giả lập "tiến trình chết" để lại một lần chạy treo, nên dựng lại ứng dụng cho bài sau.
  if (t.mail.hangCount > 0) {
    await t.app.close();
    t = await createTestApp();
    mail = t.app.get(MailService);
  }
  t.mail.reset();
  t.messages.reset();
});

describe('hàng đợi thư: đường xuyên suốt', () => {
  it('M-01: xếp một thư rồi chạy job thì máy chủ thư nhận đúng một thư, thư ở trạng thái đã gửi', async () => {
    const { id } = await mail.enqueue({
      kind: 'activation',
      toEmail: 'sinhvien@example.com',
      lane: 'bulk',
    });
    await t.queue.drain();

    expect(t.mail.sent).toEqual([
      {
        to: 'sinhvien@example.com',
        subject: expect.stringContaining('Kích hoạt tài khoản'),
        text: expect.stringContaining('Chào Người nhận sinhvien@example.com'),
        html: expect.stringContaining('Chào Người nhận sinhvien@example.com'),
      },
    ]);
    expect(await mail.get(id)).toMatchObject({ id, status: 'sent' });
  });
});

describe('mã chỉ sinh lúc gửi, hàng đợi không chứa mã (Q381)', () => {
  it('M-02: sau khi xếp thư và trước khi chạy job, bộ dựng chưa được gọi', async () => {
    await mail.enqueue({ kind: 'activation', toEmail: 'a@example.com', lane: 'bulk' });
    expect(t.messages.calls).toEqual([]);
    expect(t.messages.issued).toEqual([]);
  });

  it('M-03: bộ dựng được gọi đúng một lần khi job chạy, và thư mang mã vừa sinh', async () => {
    await mail.enqueue({ kind: 'password_reset', toEmail: 'a@example.com', lane: 'urgent' });
    await t.queue.drain();
    expect(t.messages.calls).toHaveLength(1);
    expect(t.messages.issued).toHaveLength(1);
    expect(t.mail.sent[0]?.text).toContain(t.messages.issued[0] as string);
  });

  it('M-04: gửi lỗi tạm thời rồi thử lại thì sinh mã mới và mã cũ hết hiệu lực', async () => {
    t.mail.failNext('temporary');
    const { id } = await mail.enqueue({
      kind: 'activation',
      toEmail: 'a@example.com',
      lane: 'bulk',
    });
    await t.queue.drain();
    expect(t.mail.sent).toEqual([]);
    expect(await mail.get(id)).toMatchObject({ status: 'pending' });

    t.clock.advance(seconds(61));
    await runDispatch();

    const [first, second] = t.messages.issued as [string, string];
    expect(second).not.toBe(first);
    expect(t.mail.sent).toHaveLength(1);
    expect(t.mail.sent[0]?.text).toContain(second);
    expect(t.mail.sent[0]?.text).not.toContain(first);
    expect(t.messages.isActive(first)).toBe(false);
    expect(t.messages.isActive(second)).toBe(true);
    expect(await mail.get(id)).toMatchObject({ status: 'sent' });
  });
});

describe('hạn mức 24 giờ trượt tính từ cơ sở dữ liệu', () => {
  // Hạn mức thu nhỏ 10 lần (trần 40 thay vì 400) để bài chạy nhanh; các con số thật 400/300 nằm ở bài đơn vị của
  // `planBatch` và bài kiểm mặc định cấu hình.
  const SMALL = { total: 40, bulk: 30, warmupBulk: [] };
  let small: TestApp;
  let smallMail: MailService;
  const runSmallDispatch = () => small.app.get(JobRegistry).run('mail.dispatch', {});

  beforeAll(async () => {
    small = await createTestApp({ mailLimits: SMALL });
    smallMail = small.app.get(MailService);
  });
  afterAll(async () => {
    await small.app.close();
  });
  beforeEach(() => {
    small.mail.reset();
    small.messages.reset();
    small.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  });

  const enqueueUrgent = (count: number) =>
    smallMail.enqueueMany(
      Array.from({ length: count }, (_, i) => ({
        kind: 'password_reset' as const,
        toEmail: `u${i}@example.com`,
        lane: 'urgent' as const,
      })),
    );

  it('M-05: xếp 45 thư khẩn với trần 40: đúng 40 thư đi trong 24 giờ đầu, 5 thư còn chờ (không lỗi)', async () => {
    await enqueueUrgent(45);
    await small.queue.drain();
    expect(small.mail.sent).toHaveLength(40);
    expect(await smallMail.counts()).toMatchObject({ sent: 40, pending: 5, failed: 0 });
  });

  it('M-06: tua 24 giờ thì 5 thư còn lại được gửi, không thư nào mất hay bị đánh dấu lỗi', async () => {
    await enqueueUrgent(45);
    await small.queue.drain();
    small.clock.advance(hours(24) + seconds(1));
    await runSmallDispatch();
    expect(small.mail.sent).toHaveLength(45);
    expect(await smallMail.counts()).toMatchObject({ sent: 45, pending: 0, failed: 0 });
  });

  it('M-07: dựng lại ứng dụng trên cùng cơ sở dữ liệu thì hạn mức đã dùng vẫn được tính', async () => {
    await enqueueUrgent(40);
    await small.queue.drain();
    expect(small.mail.sent).toHaveLength(40);

    const restarted = await createTestApp({ mailLimits: SMALL });
    try {
      restarted.clock.set(small.clock.now());
      const again = restarted.app.get(MailService);
      await again.enqueue({ kind: 'password_reset', toEmail: 'muon@example.com', lane: 'urgent' });
      await restarted.queue.drain();
      expect(restarted.mail.sent).toEqual([]);
      expect(await again.counts()).toMatchObject({ sent: 40, pending: 1 });
    } finally {
      await restarted.app.close();
    }
  });

  it('M-08: hai thư gửi liền nhau cách nhau đúng 6 giây', async () => {
    await smallMail.enqueue({ kind: 'password_reset', toEmail: 'a@example.com', lane: 'urgent' });
    await smallMail.enqueue({ kind: 'password_reset', toEmail: 'b@example.com', lane: 'urgent' });
    await small.queue.drain();
    expect(small.mail.sentAt).toHaveLength(2);
    expect(
      (small.mail.sentAt[1] as Date).getTime() - (small.mail.sentAt[0] as Date).getTime(),
    ).toBe(6000);
  });
});

describe('công bằng giữa nhiều Người ra đề, thư khẩn và giới hạn gửi lại (Q375)', () => {
  const SMALL = { total: 40, bulk: 30, warmupBulk: [] };
  let small: TestApp;
  let smallMail: MailService;

  beforeAll(async () => {
    small = await createTestApp({ mailLimits: SMALL });
    smallMail = small.app.get(MailService);
  });
  afterAll(async () => {
    await small.app.close();
  });
  beforeEach(() => {
    small.mail.reset();
    small.messages.reset();
    small.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  });

  const activation = (prefix: string, count: number, requestedBy: string) =>
    Array.from({ length: count }, (_, i) => ({
      kind: 'activation' as const,
      toEmail: `${prefix}${i}@example.com`,
      lane: 'bulk' as const,
      requestedBy,
    }));

  it('M-09: A xếp 50 thư kích hoạt, B xếp 3 thư sau đó: trong ngày đầu (trần hàng loạt 30) thư của B xong hết', async () => {
    const a = await seedUser({ roleTags: ['examiner'] });
    const b = await seedUser({ roleTags: ['examiner'] });
    await smallMail.enqueueMany(activation('a', 50, a.id));
    await smallMail.enqueueMany(activation('b', 3, b.id));
    await small.queue.drain();

    const recipients = small.mail.sent.map((mail) => mail.to);
    expect(recipients).toHaveLength(30);
    for (const wanted of ['b0', 'b1', 'b2']) expect(recipients).toContain(`${wanted}@example.com`);
  });

  it('M-10: khi hàng loạt đã đầy 30, thư khẩn (quên mật khẩu) vẫn đi ngay', async () => {
    const a = await seedUser({ roleTags: ['examiner'] });
    await smallMail.enqueueMany(activation('a', 31, a.id));
    await small.queue.drain();
    expect(small.mail.sent).toHaveLength(30);

    await smallMail.enqueue({
      kind: 'password_reset',
      toEmail: 'quen@example.com',
      lane: 'urgent',
    });
    await small.queue.drain();
    expect(small.mail.sent.map((mail) => mail.to)).toContain('quen@example.com');
    expect(await smallMail.counts()).toMatchObject({ sent: 31, pending: 1 });
  });

  it('M-11: xếp lại cùng người nhận, cùng loại thư trong thời gian chờ thì bị từ chối, nêu giờ được gửi lại', async () => {
    const mail = { kind: 'activation' as const, toEmail: 'sv@example.com', lane: 'bulk' as const };
    const first = await smallMail.enqueueWithCooldown(mail, { cooldownMs: hours(24) });
    expect(first).toMatchObject({ queued: true });
    await small.queue.drain();

    small.clock.advance(hours(5));
    // Người nhận so sánh không phân biệt chữ hoa thường.
    const second = await smallMail.enqueueWithCooldown(
      { ...mail, toEmail: 'SV@Example.COM' },
      { cooldownMs: hours(24) },
    );
    expect(second).toEqual({
      queued: false,
      allowedAt: new Date(new Date('2026-11-02T08:00:00+07:00').getTime() + hours(24)),
    });

    // Đủ 24 giờ kể từ thư trước thì xếp lại được; thư khác loại hay người khác không bị chặn.
    small.clock.advance(hours(19));
    expect(await smallMail.enqueueWithCooldown(mail, { cooldownMs: hours(24) })).toMatchObject({
      queued: true,
    });
    expect(
      await smallMail.enqueueWithCooldown(
        { ...mail, kind: 'password_reset' as const },
        { cooldownMs: hours(24) },
      ),
    ).toMatchObject({ queued: true });
  });
});

describe('lỗi gửi: thử lại, từ chối cứng, ngắt mạch, che bí mật', () => {
  /** Chạy job như cron và báo bộ dựng đã được gọi thêm mấy lần (mỗi lần thử gửi gọi bộ dựng một lần). */
  const attempts = () => t.messages.calls.length;
  const runAfter = async (ms: number) => {
    t.clock.advance(ms);
    await runDispatch();
  };

  it('M-12: lỗi tạm thời: thử lại sau 60, 120, 240, 480 giây; tối đa 5 lần rồi thất bại kèm lý do', async () => {
    t.mail.failNext('temporary', { message: 'hộp thư tạm thời quá tải', times: 5 });
    const { id } = await mail.enqueue({
      kind: 'activation',
      toEmail: 'a@example.com',
      lane: 'bulk',
    });
    await t.queue.drain();
    expect(attempts()).toBe(1);

    // Job tự chờ nếu còn dưới 30 giây tới hạn, nên kiểm "chưa tới giờ" ở mốc sớm hơn 40 giây.
    const EARLY = 40;
    for (const [index, wait] of [60, 120, 240, 480].entries()) {
      await runAfter(seconds(wait - EARLY));
      expect(attempts()).toBe(index + 1); // chưa tới giờ thì chưa thử
      await runAfter(seconds(EARLY));
      expect(attempts()).toBe(index + 2);
    }

    expect(await mail.get(id)).toMatchObject({
      status: 'failed',
      attemptCount: 5,
      lastError: 'hộp thư tạm thời quá tải',
    });
    await runAfter(hours(3));
    expect(attempts()).toBe(5); // thất bại rồi thì không thử nữa
  });

  it('M-12b: bộ dựng thư ném lỗi lạ: thử lại như lỗi tạm thời, hết 5 lần thì thất bại, không lặp vô hạn', async () => {
    t.messages.failNext(5, 'không dựng được thư');
    const { id } = await mail.enqueue({
      kind: 'activation',
      toEmail: 'a@example.com',
      lane: 'bulk',
    });
    await t.queue.drain();
    for (const wait of [60, 120, 240, 480]) await runAfter(seconds(wait));

    expect(await mail.get(id)).toMatchObject({ status: 'failed', attemptCount: 5 });
    expect(t.mail.sent).toEqual([]);
  });

  it('M-13: lỗi vĩnh viễn của người nhận: không thử lại, đánh dấu bị từ chối, thư khác vẫn đi', async () => {
    t.mail.failNext('permanent', { to: 'sai@example.com', message: '550 hộp thư không tồn tại' });
    const bad = await mail.enqueue({
      kind: 'activation',
      toEmail: 'sai@example.com',
      lane: 'bulk',
    });
    const good = await mail.enqueue({
      kind: 'activation',
      toEmail: 'dung@example.com',
      lane: 'bulk',
    });
    await t.queue.drain();
    await runAfter(hours(2));

    expect(await mail.get(bad.id)).toMatchObject({ status: 'rejected', attemptCount: 1 });
    expect(await mail.get(good.id)).toMatchObject({ status: 'sent' });
    expect(t.messages.calls.filter((c) => c.toEmail === 'sai@example.com')).toHaveLength(1);
  });

  it('M-14: địa chỉ đã bị từ chối cứng thì thư sau tới địa chỉ đó không gửi và không tính vào hạn mức', async () => {
    t.mail.failNext('permanent', { to: 'sai@example.com' });
    await mail.enqueue({ kind: 'activation', toEmail: 'sai@example.com', lane: 'bulk' });
    await t.queue.drain();
    const callsBefore = attempts();

    const later = await mail.enqueue({
      kind: 'password_reset',
      toEmail: 'SAI@example.com',
      lane: 'urgent',
    });
    await t.queue.drain();

    expect(await mail.get(later.id)).toMatchObject({ status: 'rejected' });
    expect(attempts()).toBe(callsBefore); // bộ dựng và vận chuyển đều không bị gọi
    expect(t.mail.sent).toEqual([]);
  });

  it('M-15: sai thông tin đăng nhập SMTP: ngắt mạch 15 phút, không đánh dấu người nhận nào lỗi, hết lỗi thì gửi tiếp, không mất thư', async () => {
    t.mail.failNext('auth', { message: '535 sai mật khẩu ứng dụng' });
    const a = await mail.enqueue({ kind: 'activation', toEmail: 'a@example.com', lane: 'bulk' });
    const b = await mail.enqueue({ kind: 'activation', toEmail: 'b@example.com', lane: 'bulk' });
    await t.queue.drain();

    expect(await mail.get(a.id)).toMatchObject({ status: 'pending', attemptCount: 0 });
    expect(await mail.get(b.id)).toMatchObject({ status: 'pending', attemptCount: 0 });
    expect(attempts()).toBe(1); // chỉ một lần thử rồi dừng, không đập vào máy chủ thư với từng thư

    await runAfter(minutes(14));
    expect(attempts()).toBe(1); // mạch còn ngắt

    await runAfter(minutes(1));
    expect(t.mail.sent.map((m) => m.to).sort()).toEqual(['a@example.com', 'b@example.com']);
    expect(await mail.counts()).toMatchObject({ sent: 2, pending: 0, failed: 0, rejected: 0 });
  });

  it('M-16: thông báo lỗi ghi lại không chứa mật khẩu SMTP dù máy chủ thư lỡ nhắc tới nó', async () => {
    t.mail.failNext('temporary', {
      to: 'a@example.com',
      message: `535 xác thực thất bại với mật khẩu ${TEST_SMTP_SECRET}`,
    });
    const { id } = await mail.enqueue({
      kind: 'activation',
      toEmail: 'a@example.com',
      lane: 'bulk',
    });
    await t.queue.drain();

    const record = await mail.get(id);
    expect(record?.lastError).toContain('xác thực thất bại');
    expect(record?.lastError).not.toContain(TEST_SMTP_SECRET);
  });
});

describe('bền vững và đồng thời', () => {
  const runAfterMinutes = async (n: number) => {
    t.clock.advance(minutes(n));
    await runDispatch();
  };
  const settle = () => new Promise((done) => setTimeout(done, 20));

  it('M-17: tiến trình chết khi đang gửi (chưa tới máy chủ thư): quá 10 phút thư được nhận lại và gửi, không mất', async () => {
    t.mail.hangNext({ afterDelivering: false });
    const { id } = await mail.enqueue({
      kind: 'activation',
      toEmail: 'a@example.com',
      lane: 'bulk',
    });
    void t.queue.drain(); // treo mãi: tiến trình "đã chết"
    await settle();
    expect(await mail.get(id)).toMatchObject({ status: 'sending' });

    t.clock.advance(minutes(9));
    await runDispatch();
    expect(t.mail.sent).toEqual([]); // chưa đủ 10 phút: vẫn coi là đang gửi

    t.clock.advance(minutes(2));
    await runDispatch();
    expect(t.mail.sent.map((m) => m.to)).toEqual(['a@example.com']);
    expect(await mail.get(id)).toMatchObject({ status: 'sent' });
  });

  it('M-18: máy chủ thư đã nhận thư rồi tiến trình mới chết: người nhận có nhiều nhất hai bản, không hơn', async () => {
    t.mail.hangNext({ afterDelivering: true });
    const { id } = await mail.enqueue({
      kind: 'activation',
      toEmail: 'a@example.com',
      lane: 'bulk',
    });
    void t.queue.drain();
    await settle();
    expect(t.mail.sent).toHaveLength(1);

    t.clock.advance(minutes(11));
    await runDispatch();
    await runAfterMinutes(5);
    expect(t.mail.sent).toHaveLength(2);
    expect(await mail.get(id)).toMatchObject({ status: 'sent' });
  });

  it('M-19: hai tiến trình (hai bản ứng dụng cùng cơ sở dữ liệu) xử lý cùng lúc: mỗi thư gửi đúng một lần, giữ khoảng cách 6 giây', async () => {
    const other = await createTestApp();
    try {
      other.clock.set(t.clock.now());
      await mail.enqueueMany(
        Array.from({ length: 12 }, (_, i) => ({
          kind: 'password_reset' as const,
          toEmail: `u${i}@example.com`,
          lane: 'urgent' as const,
        })),
      );
      const runAll = async (app: TestApp) => {
        await app.app.get(JobRegistry).run('mail.dispatch', {});
        await app.queue.drain();
      };
      await Promise.all([runAll(t), runAll(other)]);

      const recipients = [...t.mail.sent, ...other.mail.sent].map((m) => m.to);
      expect(recipients).toHaveLength(12);
      expect(new Set(recipients).size).toBe(12);

      // Đo trên giờ nhận việc (cột sent_at): mỗi bản có đồng hồ giả riêng nên giờ ghi ở vận chuyển giả không so được.
      const rows = await sql<{ sent_at: Date }>(
        'SELECT sent_at FROM email_outbox ORDER BY sent_at',
      );
      const times = rows.map((row) => row.sent_at.getTime());
      for (let i = 1; i < times.length; i++) {
        expect((times[i] as number) - (times[i - 1] as number)).toBeGreaterThanOrEqual(6000);
      }
    } finally {
      await other.app.close();
    }
  });

  it('M-21: một lần chạy job không kéo dài quá 50 giây: phần còn lại được xếp chạy tiếp, không mất thư', async () => {
    // Gửi 300 thư cách nhau 6 giây mất 30 phút; một job chiếm chỗ của worker lâu vậy sẽ làm các job khác (tự nộp
    // bài quá hạn, chấm tự động) phải chờ. Nên mỗi lần chạy có hạn thời gian và tự xếp lần chạy kế.
    await mail.enqueueMany(
      Array.from({ length: 30 }, (_, i) => ({
        kind: 'password_reset' as const,
        toEmail: `u${i}@example.com`,
        lane: 'urgent' as const,
      })),
    );
    t.queue.discard(); // bỏ cú kích của lúc xếp; chỉ xem lần chạy do cron
    const started = t.clock.now().getTime();
    await runDispatch();

    const elapsed = t.clock.now().getTime() - started;
    expect(elapsed).toBeLessThanOrEqual(60_000);
    expect(t.mail.sent.length).toBeGreaterThan(0);
    expect(t.mail.sent.length).toBeLessThan(30);
    expect(t.queue.pending).toBeGreaterThanOrEqual(1); // đã xếp lần chạy tiếp

    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(30);
    expect(await mail.counts()).toMatchObject({ sent: 30, pending: 0 });
  });

  it('M-21c: lần chạy kế được giao ngay (như BullMQ có chỗ rảnh) vẫn làm tiếp được, không bị cờ của lần chạy trước chặn', async () => {
    await mail.enqueueMany(
      Array.from({ length: 30 }, (_, i) => ({
        kind: 'password_reset' as const,
        toEmail: `u${i}@example.com`,
        lane: 'urgent' as const,
      })),
    );
    t.queue.discard();
    t.queue.runImmediately = true;
    try {
      await runDispatch();
    } finally {
      t.queue.runImmediately = false;
    }
    expect(t.mail.sent).toHaveLength(30);
  });

  it('M-21b: mỗi tiến trình chỉ chạy một lần gửi tại một thời điểm, để không chiếm cả hai chỗ chạy job của worker', async () => {
    t.mail.hangNext({ afterDelivering: false });
    await mail.enqueue({ kind: 'password_reset', toEmail: 'a@example.com', lane: 'urgent' });
    await mail.enqueue({ kind: 'password_reset', toEmail: 'b@example.com', lane: 'urgent' });
    void runDispatch(); // lần chạy đầu kẹt ở vận chuyển
    await settle();

    const started = performance.now();
    await runDispatch(); // lần chạy thứ hai phải trả về ngay, không chờ và không gửi
    expect(performance.now() - started).toBeLessThan(100);
    expect(t.mail.sent).toEqual([]);
  });

  it('M-19b: việc chọn thư là tuần tự giữa các tiến trình: có ai đang giữ khóa chọn thư thì dispatch phải chờ', async () => {
    const other = new Client({ connectionString: process.env.DATABASE_URL });
    await other.connect();
    try {
      await mail.enqueue({ kind: 'password_reset', toEmail: 'a@example.com', lane: 'urgent' });
      await other.query('SELECT pg_advisory_lock($1)', [DISPATCH_LOCK_KEY]); // "tiến trình khác" đang chọn thư
      const running = runDispatch();
      await settle();
      expect(t.mail.sent).toEqual([]); // phải chờ, chưa gửi gì

      await other.query('SELECT pg_advisory_unlock($1)', [DISPATCH_LOCK_KEY]);
      await running;
      expect(t.mail.sent.map((m) => m.to)).toEqual(['a@example.com']);
    } finally {
      await other.end();
    }
  });

  it('M-20: xếp thư không chờ việc gửi: vận chuyển treo mãi mà enqueue vẫn xong ngay', async () => {
    t.mail.hangNext({ afterDelivering: false });
    await mail.enqueue({ kind: 'password_reset', toEmail: 'a@example.com', lane: 'urgent' });
    void t.queue.drain();
    const started = performance.now();
    await mail.enqueue({ kind: 'password_reset', toEmail: 'b@example.com', lane: 'urgent' });
    expect(performance.now() - started).toBeLessThan(300);
  });

  it('M-20b: Redis hỏng lúc xếp thư thì enqueue vẫn thành công (thư đã nằm bền trong cơ sở dữ liệu), cron mỗi phút gửi nốt', async () => {
    t.queue.failNextEnqueue = true;
    const { id } = await mail.enqueue({
      kind: 'password_reset',
      toEmail: 'a@example.com',
      lane: 'urgent',
    });
    expect(await mail.get(id)).toMatchObject({ status: 'pending' });

    await runDispatch();
    expect(await mail.get(id)).toMatchObject({ status: 'sent' });
  });
});

describe('chế độ không gửi (chưa cấu hình SMTP)', () => {
  it('C-01: xếp thư vẫn thành công; thư được đánh dấu bỏ qua, không dựng, không gửi, không tính hạn mức', async () => {
    const app = await createTestApp({
      mailTransport: 'none',
      mailLimits: { total: 2, bulk: 2, warmupBulk: [] },
    });
    try {
      const service = app.app.get(MailService);
      const ids = await service.enqueueMany(
        Array.from({ length: 5 }, (_, i) => ({
          kind: 'activation' as const,
          toEmail: `u${i}@example.com`,
          lane: 'bulk' as const,
        })),
      );
      await app.queue.drain();

      expect(await service.get(ids[0] as string)).toMatchObject({ status: 'skipped' });
      // Hạn mức chỉ 2 thư mà cả 5 đều xử lý xong: thư bỏ qua không chiếm chỗ.
      expect(await service.counts()).toMatchObject({ skipped: 5, pending: 0, sent: 0 });
      expect(app.messages.calls).toEqual([]);
      expect(app.mail.sent).toEqual([]);
    } finally {
      await app.app.close();
    }
  });
});

describe('bất biến bảo mật: mã và bí mật không lọt ra log hay bảng (Q381)', () => {
  /** Chạy trọn một luồng có đủ thành công, lỗi tạm thời, lỗi cứng, sai đăng nhập (ngắt mạch) rồi thử lại. */
  async function fullFlow() {
    t.mail.failNext('temporary', {
      to: 'tam-thoi@example.com',
      message: `451 lỗi tạm thời, mật khẩu ${TEST_SMTP_SECRET}, người nhận tam-thoi@example.com`,
    });
    t.mail.failNext('permanent', {
      to: 'sai@example.com',
      message: '550 hộp thư sai@example.com không tồn tại',
    });
    t.mail.failNext('auth', {
      to: 'dang-nhap@example.com',
      message: `535 tài khoản gui@example.org sai mật khẩu ${TEST_SMTP_SECRET}`,
    });
    for (const to of [
      'tot@example.com',
      'tam-thoi@example.com',
      'sai@example.com',
      'dang-nhap@example.com',
    ]) {
      await mail.enqueue({ kind: 'activation', toEmail: to, lane: 'bulk' });
    }
    await t.queue.drain();
    t.clock.advance(minutes(20));
    await runDispatch();
  }

  it('B-01: quét toàn bộ log của một luồng đầy đủ: không có mã, không có mật khẩu SMTP, không có địa chỉ email đầy đủ', async () => {
    const lines = await captureLogs(fullFlow);
    expect(lines.length).toBeGreaterThan(0); // luồng có ghi log (ngắt mạch) nên phép quét có nội dung để quét
    const everything = lines.join('\n');
    for (const code of t.messages.issued) expect(everything).not.toContain(code);
    expect(everything).not.toContain(TEST_SMTP_SECRET);
    expect(everything).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // không địa chỉ email nào
  });

  it('B-02: bảng email_outbox sau luồng đó không cột nào chứa mã hay mật khẩu SMTP', async () => {
    await fullFlow();
    expect(t.messages.issued.length).toBeGreaterThan(0);
    const dump = JSON.stringify(await sql('SELECT * FROM email_outbox'));
    for (const code of t.messages.issued) expect(dump).not.toContain(code);
    expect(dump).not.toContain(TEST_SMTP_SECRET);
    expect(dump).not.toMatch(/[A-Za-z0-9_-]{43}/); // không chuỗi nào dài và ngẫu nhiên như một mã
  });
});

describe('gửi thử (mail-test): kiểm cấu hình thật trước production', () => {
  it('L-01: gửi một thư thử rõ ràng qua vận chuyển đã cấu hình, không qua hàng đợi và không dựng mã', async () => {
    const result = await mail.sendTest('kiem-tra@example.com');
    expect(result).toEqual({ status: 'sent' });
    expect(t.mail.sent).toHaveLength(1);
    expect(t.mail.sent[0]).toMatchObject({
      to: 'kiem-tra@example.com',
      subject: expect.stringContaining('Thư thử'),
    });
    expect(t.mail.sent[0]?.text).toContain('Nền tảng Khảo thí Trực tuyến BLUNI');
    expect(t.mail.sent[0]?.text).not.toMatch(/https?:\/\//); // thư thử không chứa liên kết nào
    expect(t.messages.calls).toEqual([]);
    expect(await mail.counts()).toMatchObject({ pending: 0, sent: 0 });
  });

  it('L-01: địa chỉ sai định dạng bị từ chối và không gửi gì', async () => {
    expect(await mail.sendTest('khong-phai-email')).toEqual({ status: 'invalid_address' });
    expect(t.mail.sent).toEqual([]);
  });

  it('L-01: gửi lỗi thì báo loại lỗi và lý do, đã che mật khẩu SMTP', async () => {
    t.mail.failNext('auth', { message: `535 sai mật khẩu ${TEST_SMTP_SECRET}` });
    const result = await mail.sendTest('kiem-tra@example.com');
    expect(result).toMatchObject({ status: 'failed', kind: 'auth' });
    expect(JSON.stringify(result)).not.toContain(TEST_SMTP_SECRET);
    expect(JSON.stringify(result)).toContain('535');
  });

  it('L-02: chưa cấu hình gửi thư (chế độ không gửi) thì nói rõ, không gửi', async () => {
    const app = await createTestApp({ mailTransport: 'none' });
    try {
      expect(await app.app.get(MailService).sendTest('kiem-tra@example.com')).toEqual({
        status: 'not_configured',
      });
    } finally {
      await app.app.close();
    }
  });
});

describe('hiệu năng (AGENTS.md: trên 300 ms đáng xem lại, trên 1 giây là lỗi)', () => {
  it('H-01: xếp một lô 500 thư (duyệt cả lớp) trong một giao dịch dưới 300 ms', async () => {
    const batch = Array.from({ length: 500 }, (_, i) => ({
      kind: 'activation' as const,
      toEmail: `sv${i}@example.com`,
      lane: 'bulk' as const,
    }));
    const started = performance.now();
    await mail.enqueueMany(batch);
    expect(performance.now() - started).toBeLessThan(300);
    expect(await mail.counts()).toMatchObject({ pending: 500 });
  });

  it('H-02, H-03: hàng đợi 10.000 thư, mỗi vòng xử lý (chọn thư, dựng, gửi, ghi trạng thái) dưới 50 ms', async () => {
    await sql(
      `INSERT INTO email_outbox (id, kind, lane, to_email, next_attempt_at, created_at)
       SELECT gen_random_uuid(), 'activation', 'bulk', 'sv' || n || '@example.com', now(), now() + n * interval '1 millisecond'
       FROM generate_series(1, 10000) n`,
    );
    await sql('ANALYZE email_outbox');
    const app = await createTestApp({
      mailLimits: { total: 10, bulk: 10, minGapMs: 0, warmupBulk: [] },
    });
    try {
      app.clock.set(new Date(Date.now() + 3_600_000)); // sau mọi created_at trong bảng
      const started = performance.now();
      await app.app.get(JobRegistry).run('mail.dispatch', {});
      const elapsed = performance.now() - started;
      expect(app.mail.sent).toHaveLength(10);
      // 10 thư gửi + một lần lập kế hoạch cuối thấy hết hạn mức.
      expect(elapsed / 11).toBeLessThan(50);
    } finally {
      await app.app.close();
    }
  });
});
