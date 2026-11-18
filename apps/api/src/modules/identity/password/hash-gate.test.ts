import { describe, expect, it } from 'vitest';
import { GateFullError, WorkGate } from './hash-gate';

// Lỗ hổng 2 (docs/plan/slice-7d-thiet-ke-kiem-thu.md mục 12.2): trần số lần băm Argon2 chạy đồng thời và hàng đợi có hạn.

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('WorkGate', () => {
  it('G-01: không bao giờ chạy quá `concurrency` việc cùng lúc, các việc còn lại chờ theo thứ tự', async () => {
    const gate = new WorkGate({ concurrency: 2, maxQueue: 10 });
    let running = 0;
    let peak = 0;
    const order: number[] = [];
    const release = Array.from({ length: 5 }, deferred);
    const jobs = release.map((d, i) =>
      gate.run(async () => {
        running++;
        peak = Math.max(peak, running);
        order.push(i);
        await d.promise;
        running--;
        return i;
      }),
    );
    await tick();
    expect(running).toBe(2);
    for (const d of release) {
      d.resolve();
      await tick();
    }
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('G-02: hàng đợi đầy thì từ chối NGAY bằng GateFullError, không làm hỏng các việc đang chạy hay đang chờ', async () => {
    const gate = new WorkGate({ concurrency: 1, maxQueue: 2 });
    const hold = deferred();
    const accepted = [0, 1, 2].map((i) =>
      gate.run(async () => {
        await hold.promise;
        return i;
      }),
    );
    await tick();
    await expect(gate.run(async () => 99)).rejects.toBeInstanceOf(GateFullError);
    hold.resolve();
    expect(await Promise.all(accepted)).toEqual([0, 1, 2]);
  });

  it('G-03: việc ném lỗi vẫn nhả chỗ cho việc sau (không kẹt cổng)', async () => {
    const gate = new WorkGate({ concurrency: 1, maxQueue: 5 });
    const failing = gate.run(async () => {
      throw new Error('hỏng');
    });
    const next = gate.run(async () => 'ok');
    await expect(failing).rejects.toThrow('hỏng');
    expect(await next).toBe('ok');
  });

  it('G-04: sau khi hàng đợi vơi, nhận việc mới lại bình thường', async () => {
    const gate = new WorkGate({ concurrency: 1, maxQueue: 1 });
    const hold = deferred();
    const a = gate.run(async () => hold.promise);
    const b = gate.run(async () => 'b');
    await tick();
    await expect(gate.run(async () => 'c')).rejects.toBeInstanceOf(GateFullError);
    hold.resolve();
    await Promise.all([a, b]);
    expect(await gate.run(async () => 'd')).toBe('d');
  });
});
