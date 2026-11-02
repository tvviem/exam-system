import { describe, expect, it } from 'vitest';
import {
  ack,
  emptyQueue,
  enqueue,
  fail,
  nextBatch,
  retryDelayMs,
  saveStatusOf,
  seedSeqs,
} from './save-queue';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('hàng đợi lưu bài', () => {
  it('mỗi câu có clientSeq tăng dần, bắt đầu từ số server đã lưu', () => {
    let q = seedSeqs(emptyQueue(), { [A]: 4 });
    q = enqueue(q, { itemId: A, value: { optionId: 'x' } });
    q = enqueue(q, { itemId: B, value: { optionId: 'y' } });
    const { batch } = nextBatch(q);
    expect(batch).toEqual([
      { itemId: A, clientSeq: 5, value: { optionId: 'x' } },
      { itemId: B, clientSeq: 1, value: { optionId: 'y' } },
    ]);
  });

  it('đổi ý trước khi gửi: chỉ giữ lần mới nhất của câu đó', () => {
    let q = emptyQueue();
    q = enqueue(q, { itemId: A, value: { optionId: 'x' } });
    q = enqueue(q, { itemId: A, value: { optionId: 'z' } });
    expect(nextBatch(q).batch).toEqual([{ itemId: A, clientSeq: 2, value: { optionId: 'z' } }]);
  });

  it('đánh dấu và đáp án của cùng một câu gộp vào một phần tử', () => {
    let q = emptyQueue();
    q = enqueue(q, { itemId: A, value: { optionId: 'x' } });
    q = enqueue(q, { itemId: A, flagged: true });
    expect(nextBatch(q).batch).toEqual([
      { itemId: A, clientSeq: 2, value: { optionId: 'x' }, flagged: true },
    ]);
  });

  it('một lô tối đa 50 phần tử, phần còn lại chờ lô sau', () => {
    let q = emptyQueue();
    for (let i = 0; i < 120; i++) {
      q = enqueue(q, {
        itemId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        flagged: true,
      });
    }
    const first = nextBatch(q);
    expect(first.batch).toHaveLength(50);
    q = ack(
      first.queue,
      first.batch.map((b) => ({ itemId: b.itemId, status: 'saved' })),
    );
    expect(nextBatch(q).batch).toHaveLength(50);
  });

  it('không gửi lô mới khi còn một lô đang bay (giữ thứ tự)', () => {
    let q = enqueue(emptyQueue(), { itemId: A, flagged: true });
    q = nextBatch(q).queue;
    q = enqueue(q, { itemId: B, flagged: true });
    expect(nextBatch(q).batch).toEqual([]);
  });

  it('saved và stale đều là đã lưu: gỡ khỏi hàng đợi', () => {
    let q = enqueue(enqueue(emptyQueue(), { itemId: A, flagged: true }), {
      itemId: B,
      flagged: true,
    });
    const sent = nextBatch(q);
    q = ack(sent.queue, [
      { itemId: A, status: 'saved' },
      { itemId: B, status: 'stale' },
    ]);
    expect(saveStatusOf(q, true)).toBe('saved');
  });

  it('rejected bị gỡ và ghi lại để báo, không kẹt các câu khác', () => {
    let q = enqueue(enqueue(emptyQueue(), { itemId: A, flagged: true }), {
      itemId: B,
      flagged: true,
    });
    const sent = nextBatch(q);
    q = ack(sent.queue, [
      { itemId: A, status: 'rejected', reason: 'invalid_value' },
      { itemId: B, status: 'saved' },
    ]);
    expect(q.rejected).toEqual([{ itemId: A, reason: 'invalid_value' }]);
    expect(saveStatusOf(q, true)).toBe('saved');
  });

  it('lỗi mạng: lô quay lại hàng đợi và gửi lại được; câu đã đổi ý trong lúc bay lấy bản mới', () => {
    let q = enqueue(emptyQueue(), { itemId: A, value: { optionId: 'x' } });
    const sent = nextBatch(q);
    q = enqueue(sent.queue, { itemId: A, value: { optionId: 'z' } });
    q = fail(q);
    expect(q.failures).toBe(1);
    expect(nextBatch(q).batch).toEqual([{ itemId: A, clientSeq: 2, value: { optionId: 'z' } }]);
  });

  it('ack thành công đặt lại bộ đếm lỗi', () => {
    let q = fail(nextBatch(enqueue(emptyQueue(), { itemId: A, flagged: true })).queue);
    q = nextBatch(q).queue;
    q = ack(q, [{ itemId: A, status: 'saved' }]);
    expect(q.failures).toBe(0);
  });
});

describe('retryDelayMs: 1, 2, 4, 8 giây, tối đa 15', () => {
  it.each([
    [1, 1000],
    [2, 2000],
    [3, 4000],
    [4, 8000],
    [5, 15000],
    [20, 15000],
  ])('lỗi lần %d chờ %d ms', (failures, ms) => {
    expect(retryDelayMs(failures)).toBe(ms);
  });
});

describe('saveStatusOf: chỉ báo lưu', () => {
  it('"Đã lưu" chỉ khi hàng đợi trống', () => {
    expect(saveStatusOf(emptyQueue(), true)).toBe('saved');
    const q = enqueue(emptyQueue(), { itemId: A, flagged: true });
    expect(saveStatusOf(q, true)).toBe('saving');
  });
  it('mất kết nối được ưu tiên báo khi còn việc chưa lưu', () => {
    const q = enqueue(emptyQueue(), { itemId: A, flagged: true });
    expect(saveStatusOf(q, false)).toBe('offline');
  });
  it('lỗi liên tiếp thì báo chưa lưu', () => {
    const q = fail(nextBatch(enqueue(emptyQueue(), { itemId: A, flagged: true })).queue);
    expect(saveStatusOf(q, true)).toBe('unsaved');
  });
});
