import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GateBusyError, HeavyQueryGate } from './heavy-query-gate';

/** Một "truy vấn" đang chạy cho đến khi bài kiểm tra cho nó xong. */
function job(log: string[], name: string) {
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const done = new Promise<string>((resolve, reject) => {
    finish = () => resolve(name);
    fail = reject;
  });
  return {
    run: () => {
      log.push(name);
      return done;
    },
    finish: () => finish(),
    fail: (error: Error) => fail(error),
  };
}

/** Cho các lời hứa đang chờ được chạy tiếp. */
const settle = () => vi.advanceTimersByTimeAsync(0);

const gateOf = (options: Partial<{ total: number; maxQueuePerKey: number; waitMs: number }> = {}) =>
  new HeavyQueryGate({ total: 3, maxQueuePerKey: 20, waitMs: 10_000, ...options });

describe('giới hạn truy vấn nặng đồng thời', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mỗi khóa chạy tối đa số việc cho phép; việc sau chờ đến lượt', async () => {
    const gate = gateOf();
    const log: string[] = [];
    const [a, b, c] = [job(log, 'a'), job(log, 'b'), job(log, 'c')];
    const results = [a, b, c].map((j) => gate.run('u1', 2, j.run));
    await settle();
    expect(log).toEqual(['a', 'b']);
    a.finish();
    await settle();
    expect(log).toEqual(['a', 'b', 'c']);
    b.finish();
    c.finish();
    await expect(Promise.all(results)).resolves.toEqual(['a', 'b', 'c']);
  });

  it('người dùng nặng không chặn người khác: người khác vào ngay khi còn chỗ chung', async () => {
    const gate = gateOf();
    const log: string[] = [];
    for (let i = 1; i <= 5; i++) void gate.run('nang', 2, job(log, `nang${i}`).run);
    void gate.run('khac', 2, job(log, 'khac').run);
    await settle();
    expect(log).toEqual(['nang1', 'nang2', 'khac']);
  });

  it('tổng số việc của mọi người không vượt giới hạn chung', async () => {
    const gate = gateOf({ total: 3 });
    const log: string[] = [];
    const jobs = ['u1', 'u2', 'u3', 'u4'].map((key) => ({ key, j: job(log, key) }));
    for (const { key, j } of jobs) void gate.run(key, 2, j.run);
    await settle();
    expect(log).toEqual(['u1', 'u2', 'u3']);
    jobs[1]?.j.finish();
    await settle();
    expect(log).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('việc lỗi vẫn trả chỗ và lỗi đến đúng người gọi', async () => {
    const gate = gateOf({ total: 1 });
    const log: string[] = [];
    const bad = job(log, 'loi');
    const first = gate.run('u1', 1, bad.run);
    const second = gate.run('u2', 1, async () => 'sau');
    bad.fail(new Error('hỏng'));
    await expect(first).rejects.toThrow('hỏng');
    await expect(second).resolves.toBe('sau');
  });

  it('hàng đợi của một khóa đã đầy thì từ chối ngay, khóa khác vẫn được chờ', async () => {
    const gate = gateOf({ total: 1, maxQueuePerKey: 1 });
    const log: string[] = [];
    const running = job(log, 'chay');
    void gate.run('u1', 1, running.run);
    void gate.run('u1', 1, job(log, 'cho').run);
    await expect(gate.run('u1', 1, async () => 'thua')).rejects.toBeInstanceOf(GateBusyError);
    const other = gate.run('u2', 1, async () => 'khac');
    running.finish();
    await settle();
    expect(log).toEqual(['chay', 'cho']);
    void other;
  });

  it('chờ quá hạn thì từ chối và không bao giờ chạy việc đó', async () => {
    const gate = gateOf({ total: 1, waitMs: 10_000 });
    const log: string[] = [];
    const running = job(log, 'chay');
    void gate.run('u1', 1, running.run);
    const late = gate.run('u2', 1, job(log, 'muon').run);
    const rejected = expect(late).rejects.toBeInstanceOf(GateBusyError);
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    running.finish();
    await settle();
    expect(log).toEqual(['chay']);
  });

  it('người gọi bỏ cuộc (đóng kết nối) lúc đang chờ thì rời hàng, nhường chỗ', async () => {
    const gate = gateOf({ total: 1, maxQueuePerKey: 1 });
    const log: string[] = [];
    const running = job(log, 'chay');
    void gate.run('u1', 1, running.run);
    const abort = new AbortController();
    const gone = gate.run('u1', 1, job(log, 'bo').run, abort.signal);
    const rejected = expect(gone).rejects.toBeInstanceOf(GateBusyError);
    abort.abort();
    await rejected;
    const next = gate.run('u1', 1, async () => 'moi'); // hàng đã trống nên được nhận
    running.finish();
    await expect(next).resolves.toBe('moi');
    expect(log).toEqual(['chay']);
  });
});
