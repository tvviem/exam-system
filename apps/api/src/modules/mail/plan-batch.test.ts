import { describe, expect, it } from 'vitest';
import {
  type MailLane,
  type PlanLimits,
  planBatch,
  type QueuedMail,
  type SentMail,
} from './plan-batch';

// Bảng kịch bản của hàm lập lịch thuần (docs/plan/slice-7b-thiet-ke-kiem-thu.md mục 5, lát 3). Các con số 400, 300,
// 100, 6 giây lấy từ ADR-0009 và Q375, viết thẳng vào test chứ không import từ mã.

const NOW = new Date('2026-11-12T08:00:00+07:00');
const HOUR = 3_600_000;
const LIMITS: PlanLimits = { total: 400, bulk: 300, minGapMs: 6000, warmupBulk: [] };

const queued = (
  id: string,
  lane: MailLane = 'bulk',
  extra: Partial<QueuedMail> = {},
): QueuedMail => ({
  id,
  lane,
  requestedBy: null,
  createdAt: new Date(NOW.getTime() - HOUR),
  nextAttemptAt: new Date(NOW.getTime() - HOUR),
  ...extra,
});

/** `count` thư đã gửi, rải đều trong 23 giờ qua (không dính khoảng cách 6 giây), thư cũ nhất cách đây 23 giờ. */
const sentMails = (
  count: number,
  lane: MailLane = 'bulk',
  requestedBy: string | null = null,
): SentMail[] =>
  Array.from({ length: count }, (_, i) => ({
    sentAt: new Date(NOW.getTime() - 23 * HOUR + i * 20_000),
    lane,
    requestedBy,
  }));

describe('planBatch: hạn mức 24 giờ trượt', () => {
  it('P-01: hàng đợi rỗng thì không gửi, không cần thức dậy', () => {
    expect(planBatch({ queue: [], sent: [], now: NOW, limits: LIMITS })).toEqual({
      send: null,
      wakeAt: null,
    });
  });

  it('P-02: một thư hàng loạt, chưa gửi thư nào thì gửi ngay', () => {
    const mail = queued('m1');
    expect(planBatch({ queue: [mail], sent: [], now: NOW, limits: LIMITS }).send).toBe(mail);
  });

  it('P-03: đã gửi đủ 400 thì không gửi; thức dậy khi thư cũ nhất hết 24 giờ', () => {
    const sent = [...sentMails(200, 'bulk'), ...sentMails(200, 'urgent')];
    const oldest = Math.min(...sent.map((s) => s.sentAt.getTime()));
    const plan = planBatch({ queue: [queued('m1', 'urgent')], sent, now: NOW, limits: LIMITS });
    expect(plan.send).toBeNull();
    expect(plan.wakeAt).toEqual(new Date(oldest + 24 * HOUR));
  });

  it('P-04: đã gửi đủ 300 thư hàng loạt thì hoãn thư hàng loạt nhưng thư khẩn vẫn đi (còn 100 dự trữ)', () => {
    const sent = sentMails(300, 'bulk');
    const bulk = queued('hang-loat');
    const urgent = queued('khan', 'urgent');
    expect(planBatch({ queue: [bulk], sent, now: NOW, limits: LIMITS }).send).toBeNull();
    expect(planBatch({ queue: [bulk, urgent], sent, now: NOW, limits: LIMITS }).send).toBe(urgent);
  });

  it('P-05: đã gửi 399 thì thư khẩn còn gửi được (thành 400)', () => {
    const urgent = queued('khan', 'urgent');
    const sent = [...sentMails(300, 'bulk'), ...sentMails(99, 'urgent')];
    expect(planBatch({ queue: [urgent], sent, now: NOW, limits: LIMITS }).send).toBe(urgent);
  });

  it('P-06: đã gửi 400 thì thư khẩn cũng không gửi (trần là trần)', () => {
    const sent = [...sentMails(300, 'bulk'), ...sentMails(100, 'urgent')];
    expect(
      planBatch({ queue: [queued('khan', 'urgent')], sent, now: NOW, limits: LIMITS }).send,
    ).toBeNull();
  });

  it('P-16: thư khẩn đi trước thư hàng loạt dù thư hàng loạt xếp trước, khi cả hai đều đủ điều kiện', () => {
    const olderBulk = queued('hang-loat', 'bulk', {
      createdAt: new Date(NOW.getTime() - 5 * HOUR),
    });
    const newerUrgent = queued('khan', 'urgent', { createdAt: new Date(NOW.getTime() - 1 * HOUR) });
    const plan = planBatch({ queue: [olderBulk, newerUrgent], sent: [], now: NOW, limits: LIMITS });
    expect(plan.send).toBe(newerUrgent);
  });

  it('thư gửi quá 24 giờ trước không còn tính vào hạn mức', () => {
    const old: SentMail[] = Array.from({ length: 400 }, () => ({
      sentAt: new Date(NOW.getTime() - 25 * HOUR),
      lane: 'bulk' as const,
      requestedBy: null,
    }));
    const mail = queued('m1');
    expect(planBatch({ queue: [mail], sent: old, now: NOW, limits: LIMITS }).send).toBe(mail);
  });
});

describe('planBatch: khoảng cách giữa hai thư', () => {
  it('P-09: thư vừa gửi cách đây 3 giây thì chưa gửi tiếp, thức dậy sau đúng 3 giây nữa', () => {
    const justSent: SentMail = {
      sentAt: new Date(NOW.getTime() - 3000),
      lane: 'bulk',
      requestedBy: null,
    };
    const plan = planBatch({ queue: [queued('m1')], sent: [justSent], now: NOW, limits: LIMITS });
    expect(plan.send).toBeNull();
    expect(plan.wakeAt).toEqual(new Date(NOW.getTime() + 3000));
  });

  it('đủ 6 giây kể từ thư trước thì gửi được', () => {
    const justSent: SentMail = {
      sentAt: new Date(NOW.getTime() - 6000),
      lane: 'bulk',
      requestedBy: null,
    };
    const mail = queued('m1');
    expect(planBatch({ queue: [mail], sent: [justSent], now: NOW, limits: LIMITS }).send).toBe(
      mail,
    );
  });
});

/** Chạy `planBatch` lặp lại như worker: gửi thư được chọn, tua tới giờ thức dậy khi chưa gửi được. */
function simulate(queue: QueuedMail[], limits: PlanLimits, maxSends: number): QueuedMail[] {
  const remaining = [...queue];
  const sent: SentMail[] = [];
  const order: QueuedMail[] = [];
  let now = NOW.getTime();
  while (order.length < maxSends && remaining.length > 0) {
    const plan = planBatch({ queue: remaining, sent, now: new Date(now), limits });
    if (plan.send) {
      order.push(plan.send);
      remaining.splice(remaining.indexOf(plan.send), 1);
      sent.push({
        sentAt: new Date(now),
        lane: plan.send.lane,
        requestedBy: plan.send.requestedBy,
      });
      now += 1; // hết nhịp này; khoảng cách 6 giây do planBatch tự đòi
    } else if (plan.wakeAt && plan.wakeAt.getTime() < NOW.getTime() + 24 * HOUR) {
      now = Math.max(now + 1, plan.wakeAt.getTime());
    } else break;
  }
  return order;
}

describe('planBatch: xoay vòng công bằng giữa những người xếp thư (Q375)', () => {
  const batch = (by: string, count: number, firstCreatedAt: number): QueuedMail[] =>
    Array.from({ length: count }, (_, i) =>
      queued(`${by}${i + 1}`, 'bulk', {
        requestedBy: by,
        createdAt: new Date(firstCreatedAt + i),
      }),
    );

  it('P-07: A xếp 500 thư trước, B xếp 30 thư sau: trong 300 thư đầu có đủ 30 thư của B, xen kẽ từng thư', () => {
    const t0 = NOW.getTime() - 10 * HOUR;
    const queue = [...batch('A', 500, t0), ...batch('B', 30, t0 + 1000)];
    const order = simulate(queue, LIMITS, 300);
    expect(order).toHaveLength(300);
    expect(order.filter((m) => m.requestedBy === 'B')).toHaveLength(30);
    expect(order.slice(0, 6).map((m) => m.id)).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
  });

  it('P-08: cùng một người xếp nhiều thư thì thư xếp trước gửi trước', () => {
    const t0 = NOW.getTime() - 10 * HOUR;
    const queue = [...batch('A', 3, t0)].reverse();
    expect(simulate(queue, LIMITS, 3).map((m) => m.id)).toEqual(['A1', 'A2', 'A3']);
  });
});

describe('planBatch: khởi động dần (warm-up, Q382)', () => {
  // Trần thư hàng loạt các ngày 1 đến 5 là 50, 100, 150, 200, 300; từ ngày 6 là mức thường (300). Ngày tính theo
  // ngày lịch giờ Việt Nam kể từ ngày gửi thư thành công đầu tiên của hệ thống.
  const WARMUP: PlanLimits = { ...LIMITS, warmupBulk: [50, 100, 150, 200, 300] };
  // 00:30 giờ Việt Nam của ngày cách NOW (12/11) `offsetDays` ngày về trước.
  const dayStart = (offsetDays: number) =>
    new Date(new Date('2026-11-12T00:30:00+07:00').getTime() - offsetDays * 24 * HOUR);
  const recentBulk = (count: number): SentMail[] =>
    Array.from({ length: count }, (_, i) => ({
      sentAt: new Date(NOW.getTime() - 3 * HOUR + i * 10_000),
      lane: 'bulk' as const,
      requestedBy: null,
    }));
  const run = (
    firstSentAt: Date | null,
    sentCount: number,
    mails = [queued('b'), queued('u', 'urgent')],
  ) =>
    planBatch({ queue: mails, sent: recentBulk(sentCount), now: NOW, limits: WARMUP, firstSentAt });

  it('P-10: ngày thứ 1 (trần 50): đã gửi 50 thư hàng loạt thì hoãn thư hàng loạt, thư khẩn vẫn đi', () => {
    const plan = run(dayStart(0), 50);
    expect(plan.send?.id).toBe('u');
    expect(run(dayStart(0), 50, [queued('b')]).send).toBeNull();
    expect(run(dayStart(0), 49, [queued('b')]).send?.id).toBe('b');
  });

  it('chưa gửi thư nào bao giờ (firstSentAt rỗng) thì tính là ngày thứ 1', () => {
    expect(run(null, 50, [queued('b')]).send).toBeNull();
  });

  it('P-11: ngày thứ 3 (trần 150): gửi được tới thư thứ 150', () => {
    expect(run(dayStart(2), 120, [queued('b')]).send?.id).toBe('b');
    expect(run(dayStart(2), 150, [queued('b')]).send).toBeNull();
  });

  it('P-12: từ ngày thứ 6 trần là 300 như thường lệ', () => {
    expect(run(dayStart(5), 299, [queued('b')]).send?.id).toBe('b');
    expect(run(dayStart(5), 300, [queued('b')]).send).toBeNull();
  });

  it('ngày thứ 1 đổi sang ngày thứ 2 lúc nửa đêm giờ Việt Nam: thư hoãn thức dậy đúng lúc đó nếu sớm hơn lúc cửa sổ trượt có chỗ', () => {
    const plan = run(dayStart(0), 50, [queued('b')]);
    expect(plan.wakeAt).toEqual(new Date('2026-11-13T00:00:00+07:00'));
  });

  it('ngày tính theo giờ Việt Nam chứ không theo UTC: 23:30 giờ Việt Nam vẫn là ngày cũ', () => {
    const late = new Date('2026-11-12T23:30:00+07:00');
    const plan = planBatch({
      queue: [queued('b')],
      sent: Array.from({ length: 50 }, (_, i) => ({
        sentAt: new Date(late.getTime() - 60 * 60_000 + i * 10_000),
        lane: 'bulk' as const,
        requestedBy: null,
      })),
      now: late,
      limits: WARMUP,
      firstSentAt: new Date('2026-11-12T00:30:00+07:00'),
    });
    expect(plan.send).toBeNull();
  });
});

describe('planBatch: thư chờ và thư hoãn lâu', () => {
  it('P-13: thư đang chờ thử lại (nextAttemptAt ở tương lai) không được chọn; thức dậy đúng giờ đó', () => {
    const later = new Date(NOW.getTime() + 120_000);
    const plan = planBatch({
      queue: [queued('m1', 'bulk', { nextAttemptAt: later })],
      sent: [],
      now: NOW,
      limits: LIMITS,
    });
    expect(plan).toEqual({ send: null, wakeAt: later });
  });

  it('P-13b: một thư chờ thử lại và một thư sẵn sàng thì gửi thư sẵn sàng', () => {
    const waiting = queued('cho', 'urgent', { nextAttemptAt: new Date(NOW.getTime() + 60_000) });
    const ready = queued('san-sang');
    expect(planBatch({ queue: [waiting, ready], sent: [], now: NOW, limits: LIMITS }).send).toBe(
      ready,
    );
  });

  it('P-14: thư bị hoãn vì hạn mức đã quá 48 giờ vẫn chỉ hoãn, kết quả không có đường nào đánh dấu lỗi', () => {
    const old = queued('cu', 'bulk', { createdAt: new Date(NOW.getTime() - 72 * HOUR) });
    const plan = planBatch({ queue: [old], sent: sentMails(300), now: NOW, limits: LIMITS });
    expect(plan.send).toBeNull();
    expect(plan.wakeAt).not.toBeNull();
    expect(Object.keys(plan).sort()).toEqual(['send', 'wakeAt']);
  });
});

describe('planBatch: hiệu năng', () => {
  it('P-15: 10.000 thư trong hàng đợi, 400 thư đã gửi, có kết quả dưới 50 ms', () => {
    const queue = Array.from({ length: 10_000 }, (_, i) =>
      queued(`m${i}`, 'bulk', {
        requestedBy: `nguoi-${i % 20}`,
        createdAt: new Date(NOW.getTime() - HOUR + i),
      }),
    );
    const started = performance.now();
    planBatch({ queue, sent: sentMails(100, 'bulk'), now: NOW, limits: LIMITS });
    expect(performance.now() - started).toBeLessThan(50);
  });
});
