import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import type { AttemptView } from '../take';
import { memoryStore } from './memory-store';
import { loadAttempt, persistQueue, type StoredQueue, type StoredView } from './offline-attempt';
import { ack, emptyQueue, enqueue, nextBatch } from './save-queue';

// U2 (Q247): đọc Lượt làm bài có chịu mất mạng, với kho giả trong bộ nhớ thay IndexedDB.

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

function fakeStore(initial: { view?: StoredView; queue?: StoredQueue } = {}) {
  const store = memoryStore();
  if (initial.view) store.views.set('att', initial.view);
  if (initial.queue) store.queues.set('att', initial.queue);
  return store;
}

const rich = { type: 'doc', content: [] } as never;
const view = (overrides: Partial<AttemptView['attempt']> = {}): AttemptView => ({
  status: 'in_progress',
  attempt: {
    id: 'att',
    attemptNo: 1,
    maxAttempts: 1,
    startedAt: '2026-11-03T08:00:00.000Z',
    deadline: '2026-11-03T08:30:00.000Z',
    serverNow: '2026-11-03T08:00:00.000Z',
    ...overrides,
  },
  session: { id: 's', title: 'Ca thi' },
  exam: { title: 'Đề', instructions: null },
  mediaBase: '/api/take-media/att',
  sections: [
    {
      id: 'sec',
      title: null,
      instructions: null,
      items: [
        {
          itemId: A,
          no: 1,
          points: 1,
          type: 'single_choice',
          stem: rich,
          payload: { options: [{ id: 'o1', content: rich }] },
          response: { value: { optionId: 'o1' }, flagged: false, clientSeq: 2 },
        },
        {
          itemId: B,
          no: 2,
          points: 1,
          type: 'essay',
          stem: rich,
          payload: { maxLength: 100 },
          response: null,
        },
      ],
    },
  ],
});

const offline = () => Promise.reject(new TypeError('Failed to fetch'));

describe('đọc Lượt làm bài khi có thể mất mạng', () => {
  it('đọc được từ server thì giữ một bản sao trên máy, kèm giờ máy lúc nhận', async () => {
    const store = fakeStore();
    const { views } = store;
    const online = view();
    const state = await loadAttempt('att', {
      fetchAttempt: async () => online,
      store,
      now: () => 5_000,
    });
    expect(state).toEqual({ ...online, unsent: [] });
    expect(views.get('att')).toEqual({ view: online, savedAt: 5_000 });
  });

  it('mất mạng thì mở bản sao trên máy; giờ server được bù theo thời gian đã trôi', async () => {
    const stored = view();
    const store = fakeStore({ view: { view: stored, savedAt: 10_000 } });
    const state = await loadAttempt('att', {
      fetchAttempt: offline,
      store,
      now: () => 10_000 + 90_000,
    });
    if (state.status !== 'in_progress') throw new Error('phải là bản đang làm');
    expect(state.offline).toBe(true);
    expect(state.attempt.serverNow).toBe('2026-11-03T08:01:30.000Z');
    expect(state.attempt.deadline).toBe('2026-11-03T08:30:00.000Z'); // hạn không đổi
  });

  it('đồng hồ máy bị chỉnh lùi thì không bù âm (không kéo dài giờ làm bài)', async () => {
    const store = fakeStore({ view: { view: view(), savedAt: 50_000 } });
    const state = await loadAttempt('att', { fetchAttempt: offline, store, now: () => 1_000 });
    if (state.status !== 'in_progress') throw new Error('phải là bản đang làm');
    expect(state.attempt.serverNow).toBe('2026-11-03T08:00:00.000Z');
  });

  it('mất mạng mà máy chưa có bản sao thì báo lỗi gốc, không bịa nội dung', async () => {
    const store = fakeStore();
    await expect(
      loadAttempt('att', { fetchAttempt: offline, store, now: () => 0 }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe('thay đổi còn giữ trên máy', () => {
  const changes = [
    { itemId: A, clientSeq: 4, value: { optionId: 'o2' } },
    { itemId: B, clientSeq: 1, value: { text: 'bài viết lúc mất mạng' } },
  ];
  const unsent: StoredQueue = { answers: changes, items: changes };

  it('đọc lại (kể cả khi đã có mạng) thì phần chưa gửi phủ lên đáp án server và được trả để gửi lại', async () => {
    const store = fakeStore({ queue: unsent });
    const state = await loadAttempt('att', {
      fetchAttempt: async () => view(),
      store,
      now: () => 0,
    });
    if (state.status !== 'in_progress') throw new Error('phải là bản đang làm');
    const [a, b] = state.sections[0]?.items ?? [];
    expect(a?.response).toEqual({ value: { optionId: 'o2' }, flagged: false, clientSeq: 4 });
    expect(b?.response).toEqual({
      value: { text: 'bài viết lúc mất mạng' },
      flagged: false,
      clientSeq: 1,
    });
    expect(state.unsent).toEqual(unsent.items);
  });

  it('server đã có bản mới hơn (clientSeq cao hơn) thì bỏ phần cũ trên máy', async () => {
    const store = fakeStore({
      queue: {
        answers: [{ itemId: A, clientSeq: 1, value: { optionId: 'o9' } }],
        items: [{ itemId: A, clientSeq: 1, value: { optionId: 'o9' } }],
      },
    });
    const state = await loadAttempt('att', {
      fetchAttempt: async () => view(),
      store,
      now: () => 0,
    });
    if (state.status !== 'in_progress') throw new Error('phải là bản đang làm');
    expect(state.sections[0]?.items[0]?.response?.value).toEqual({ optionId: 'o1' });
    expect(state.unsent).toEqual([]);
  });

  it('chỉ đổi cờ đánh dấu thì giữ nguyên đáp án đã có', async () => {
    const store = fakeStore({
      queue: {
        answers: [{ itemId: A, clientSeq: 3, flagged: true }],
        items: [{ itemId: A, clientSeq: 3, flagged: true }],
      },
    });
    const state = await loadAttempt('att', {
      fetchAttempt: async () => view(),
      store,
      now: () => 0,
    });
    if (state.status !== 'in_progress') throw new Error('phải là bản đang làm');
    expect(state.sections[0]?.items[0]?.response).toEqual({
      value: { optionId: 'o1' },
      flagged: true,
      clientSeq: 3,
    });
  });
});

describe('câu đã được server nhận sau khi chụp bản sao đề', () => {
  it('mất mạng rồi tải lại: câu đó vẫn hiện đã trả lời, không bị trống', async () => {
    // Bản sao chụp lúc bắt đầu (câu A chưa có gì); sau đó Người dự thi chọn A, server nhận, hàng đợi trống.
    const store = fakeStore({
      view: { view: view(), savedAt: 0 },
      queue: { answers: [{ itemId: B, clientSeq: 1, value: { text: 'đã gửi xong' } }], items: [] },
    });
    const state = await loadAttempt('att', { fetchAttempt: offline, store, now: () => 0 });
    if (state.status !== 'in_progress') throw new Error('phải là bản đang làm');
    expect(state.sections[0]?.items[1]?.response?.value).toEqual({ text: 'đã gửi xong' });
    expect(state.unsent).toEqual([]); // không gửi lại những gì server đã nhận
  });
});

describe('số thứ tự clientSeq', () => {
  it('đã gửi xong rồi mới mất mạng: bản sao cũ trên máy vẫn tiếp tục từ số lớn nhất đã dùng', async () => {
    // Máy đã gửi câu A tới clientSeq 5 (hàng đợi trống) nhưng bản sao đề trên máy chỉ biết clientSeq 2.
    const store = fakeStore({
      view: { view: view(), savedAt: 0 },
      queue: { answers: [{ itemId: A, clientSeq: 5, value: { optionId: 'o3' } }], items: [] },
    });
    const state = await loadAttempt('att', { fetchAttempt: offline, store, now: () => 0 });
    if (state.status !== 'in_progress') throw new Error('phải là bản đang làm');
    expect(state.sections[0]?.items[0]?.response?.clientSeq).toBe(5);
    expect(state.sections[0]?.items[0]?.response?.value).toEqual({ optionId: 'o3' });
  });

  it('lấy số lớn hơn giữa server và máy', async () => {
    const store = fakeStore({
      queue: {
        answers: [
          { itemId: A, clientSeq: 1, value: { optionId: 'o9' } },
          { itemId: B, clientSeq: 3, value: { text: 'b' } },
        ],
        items: [],
      },
    });
    const state = await loadAttempt('att', {
      fetchAttempt: async () => view(),
      store,
      now: () => 0,
    });
    if (state.status !== 'in_progress') throw new Error('phải là bản đang làm');
    const [a, b] = state.sections[0]?.items ?? [];
    expect([a?.response?.clientSeq, b?.response?.clientSeq]).toEqual([2, 3]);
  });
});

describe('khi nào xóa, khi nào giữ', () => {
  const submitted = {
    status: 'submitted',
    attempt: {
      id: 'att',
      attemptNo: 1,
      submittedAt: 'x',
      submitReason: 'candidate',
      serverNow: 'x',
    },
  } as const;
  const stored = { view: { view: view(), savedAt: 0 }, queue: { answers: [], items: [] } };

  it('Lượt đã nộp hoặc đóng ở server thì xóa sạch trên máy', async () => {
    const store = fakeStore(stored);
    const { views, queues } = store;
    await loadAttempt('att', { fetchAttempt: async () => submitted, store, now: () => 0 });
    expect(views.size + queues.size).toBe(0);
  });

  it('Lượt không còn (404) thì xóa sạch và báo lỗi', async () => {
    const store = fakeStore(stored);
    const { views } = store;
    await expect(
      loadAttempt('att', {
        fetchAttempt: () => Promise.reject(new ApiError(404, 'NOT_FOUND')),
        store,
        now: () => 0,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(views.size).toBe(0);
  });

  it('thiết bị bị thu hồi thì báo lỗi nhưng giữ dữ liệu, để Người ra đề hoàn tác Thu hồi thì còn làm tiếp được', async () => {
    const store = fakeStore(stored);
    const { views, queues } = store;
    await expect(
      loadAttempt('att', {
        fetchAttempt: () =>
          Promise.reject(new ApiError(409, 'INVALID_STATE', { reason: 'DEVICE_REVOKED' })),
        store,
        now: () => 0,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(views.size + queues.size).toBe(2);
  });

  it('cổng web báo 502 thì coi như mất kết nối và mở bản sao trên máy', async () => {
    const store = fakeStore(stored);
    const state = await loadAttempt('att', {
      fetchAttempt: () => Promise.reject(new ApiError(502, 'UNKNOWN')),
      store,
      now: () => 0,
    });
    expect(state).toMatchObject({ status: 'in_progress', offline: true });
  });
});

describe('ghi hàng đợi xuống máy', () => {
  it('giữ cả lô đang bay lẫn phần chờ; gửi xong thì chỉ còn số thứ tự', async () => {
    const store = fakeStore();
    const { queues } = store;
    let q = enqueue(emptyQueue(), { itemId: A, value: { optionId: 'o1' } });
    q = nextBatch(q).queue;
    q = enqueue(q, { itemId: B, value: { text: 'b' } });
    await persistQueue(store, 'att', q);
    expect(queues.get('att')).toEqual({
      answers: [
        { itemId: A, clientSeq: 1, value: { optionId: 'o1' } },
        { itemId: B, clientSeq: 1, value: { text: 'b' } },
      ],
      items: [
        { itemId: B, clientSeq: 1, value: { text: 'b' } },
        { itemId: A, clientSeq: 1, value: { optionId: 'o1' } },
      ],
    });

    q = ack(q, [{ itemId: A, status: 'saved' }]);
    q = ack(nextBatch(q).queue, [{ itemId: B, status: 'saved' }]);
    await persistQueue(store, 'att', q);
    expect(queues.get('att')?.items).toEqual([]);
    // đã gửi xong nhưng câu trả lời vẫn được giữ để mở lại lúc mất mạng
    expect(queues.get('att')?.answers).toHaveLength(2);
  });
});

describe('đăng xuất trên máy dùng chung', () => {
  const sent = { itemId: A, clientSeq: 2, value: { optionId: 'o1' } };
  const unsent = { itemId: B, clientSeq: 1, value: { text: 'chưa gửi' } };

  it('bỏ bản sao đề; chỉ giữ phần chưa gửi, câu đã gửi xong không còn đọc được trên máy', async () => {
    const store = memoryStore();
    store.views.set('x', { view: view(), savedAt: 0 });
    store.queues.set('x', { answers: [sent, unsent], items: [unsent] });
    store.queues.set('y', { answers: [sent], items: [] });
    await store.forgetAll(true);
    expect(store.views.size).toBe(0);
    expect([...store.queues.keys()]).toEqual(['x']);
    expect(store.queues.get('x')).toEqual({ answers: [unsent], items: [unsent] });
  });

  it('không giữ gì khi không yêu cầu giữ', async () => {
    const store = memoryStore();
    store.queues.set('x', { answers: [unsent], items: [unsent] });
    await store.forgetAll(false);
    expect(store.queues.size).toBe(0);
  });
});
