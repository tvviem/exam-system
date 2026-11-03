import { describe, expect, it } from 'vitest';
import {
  ack,
  emptyQueue,
  enqueue,
  fail,
  knownAnswers,
  nextBatch,
  retryDelayMs,
  saveStatusOf,
  seedAnswers,
  unsentOf,
} from './save-queue';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('hàng đợi lưu bài', () => {
  it('mỗi câu có clientSeq tăng dần, bắt đầu từ số server đã lưu', () => {
    let q = seedAnswers(emptyQueue(), [{ itemId: A, clientSeq: 4, value: { optionId: 'w' } }]);
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

describe('phần chưa gửi (giữ qua IndexedDB)', () => {
  it('gộp lô đang bay và phần đang chờ; câu đổi ý trong lúc bay thì giữ bản mới', () => {
    let q = emptyQueue();
    q = enqueue(q, { itemId: A, value: { optionId: 'x' } });
    q = nextBatch(q).queue; // A đang bay với clientSeq 1
    q = enqueue(q, { itemId: A, value: { optionId: 'y' } }); // đổi ý khi đang bay: clientSeq 2
    q = enqueue(q, { itemId: B, flagged: true });
    expect(unsentOf(q)).toEqual([
      { itemId: A, clientSeq: 2, value: { optionId: 'y' } },
      { itemId: B, clientSeq: 1, flagged: true },
    ]);
  });

  it('hàng đợi đã trống thì không còn gì chưa gửi', () => {
    let q = enqueue(emptyQueue(), { itemId: A, value: { optionId: 'x' } });
    const sent = nextBatch(q);
    q = ack(sent.queue, [{ itemId: A, status: 'saved' }]);
    expect(unsentOf(q)).toEqual([]);
  });
});

describe('câu trả lời mới nhất của từng câu (giữ trên máy để mở lại lúc mất mạng)', () => {
  it('bắt đầu từ những gì đã biết, gộp mọi thay đổi sau đó, kể cả khi đã được server nhận', () => {
    let q = seedAnswers(emptyQueue(), [{ itemId: A, clientSeq: 4, value: { optionId: 'w' } }]);
    q = enqueue(q, { itemId: A, flagged: true }); // giữ đáp án cũ, thêm cờ
    q = enqueue(q, { itemId: B, value: { optionId: 'y' } });
    q = ack(nextBatch(q).queue, [
      { itemId: A, status: 'saved' },
      { itemId: B, status: 'saved' },
    ]);
    expect(unsentOf(q)).toEqual([]); // đã gửi hết...
    expect(knownAnswers(q)).toEqual([
      // ...nhưng câu trả lời vẫn còn trong danh sách để mở lại
      { itemId: A, clientSeq: 5, value: { optionId: 'w' }, flagged: true },
      { itemId: B, clientSeq: 1, value: { optionId: 'y' } },
    ]);
  });

  it('câu server từ chối thì không còn là câu trả lời đã biết', () => {
    let q = enqueue(emptyQueue(), { itemId: A, value: { optionId: 'x' } });
    q = ack(nextBatch(q).queue, [{ itemId: A, status: 'rejected', reason: 'bad_request' }]);
    expect(knownAnswers(q)).toEqual([]);
  });
});
