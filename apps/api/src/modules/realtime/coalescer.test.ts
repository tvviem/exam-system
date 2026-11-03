import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Coalescer } from './coalescer';

// Gộp thông báo: lần đầu chạy ngay (người dùng không chờ), các lần dồn dập sau đó gộp thành một lần ở cuối khoảng.
describe('Coalescer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const calls: string[] = [];
    const coalescer = new Coalescer(
      2000,
      (key) => calls.push(key),
      () => Date.now(),
    );
    return { calls, coalescer };
  };

  it('lần đầu chạy ngay', () => {
    const { calls, coalescer } = make();
    coalescer.trigger('s1');
    expect(calls).toEqual(['s1']);
  });

  it('nhiều lần trong một khoảng thì chỉ thêm đúng một lần ở cuối khoảng', () => {
    const { calls, coalescer } = make();
    coalescer.trigger('s1');
    for (let i = 0; i < 50; i++) coalescer.trigger('s1');
    expect(calls).toEqual(['s1']);
    vi.advanceTimersByTime(1999);
    expect(calls).toEqual(['s1']);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['s1', 's1']);
    vi.advanceTimersByTime(10_000);
    expect(calls).toEqual(['s1', 's1']); // không có thay đổi mới thì không chạy nữa
  });

  it('sau khi đủ khoảng yên lặng thì lần mới lại chạy ngay', () => {
    const { calls, coalescer } = make();
    coalescer.trigger('s1');
    vi.advanceTimersByTime(2000);
    coalescer.trigger('s1');
    expect(calls).toEqual(['s1', 's1']);
  });

  it('mỗi khóa tính riêng', () => {
    const { calls, coalescer } = make();
    coalescer.trigger('a');
    coalescer.trigger('b');
    expect(calls).toEqual(['a', 'b']);
  });

  it('dispose hủy lần chạy đang chờ', () => {
    const { calls, coalescer } = make();
    coalescer.trigger('s1');
    coalescer.trigger('s1');
    coalescer.dispose();
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual(['s1']);
  });

  it('giờ hệ thống nhảy lùi (đồng bộ giờ) không làm hoãn tin quá một khoảng', () => {
    // Máy WSL2 có lúc nhảy giờ lùi vài giây; nếu mốc "lần phát trước" ở tương lai thì tin bị giữ lại hàng giây.
    let clock = 10_000;
    const calls: string[] = [];
    const coalescer = new Coalescer(
      2000,
      (key) => calls.push(key),
      () => clock,
    );
    coalescer.trigger('s1');
    clock = 3000; // nhảy lùi 7 giây
    coalescer.trigger('s1');
    vi.advanceTimersByTime(2000);
    expect(calls).toEqual(['s1', 's1']);
  });
});
