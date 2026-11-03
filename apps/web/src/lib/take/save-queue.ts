// Hàng đợi lưu bài (Q241): hàm thuần trên một giá trị trạng thái, để kiểm thử không cần mạng hay IndexedDB.
// `clientSeq` tăng dần theo từng câu; mỗi câu chỉ giữ bản mới nhất; một lô tối đa 50 phần tử và chỉ một lô bay tại một lúc.

export const MAX_BATCH = 50;

export interface Change {
  itemId: string;
  value?: unknown;
  flagged?: boolean;
}

export interface SaveItem extends Change {
  clientSeq: number;
}

export type ItemResult =
  | { itemId: string; status: 'saved' | 'stale' }
  | { itemId: string; status: 'rejected'; reason: string };

export interface QueueState {
  /** `clientSeq` lớn nhất đã dùng của từng câu. */
  seqs: Record<string, number>;
  /** Câu trả lời mới nhất của từng câu (gộp mọi thay đổi, kể cả đã gửi xong): để mở lại đề lúc mất mạng thấy đủ. */
  latest: Record<string, SaveItem>;
  pending: SaveItem[];
  inflight: SaveItem[];
  failures: number;
  rejected: { itemId: string; reason: string }[];
}

export const emptyQueue = (): QueueState => ({
  seqs: {},
  latest: {},
  pending: [],
  inflight: [],
  failures: 0,
  rejected: [],
});

/** Bắt đầu từ những câu trả lời đã biết (server, hoặc còn giữ trên máy): `clientSeq` tiếp tục từ đó. */
export const seedAnswers = (queue: QueueState, answers: SaveItem[]): QueueState => ({
  ...queue,
  seqs: { ...queue.seqs, ...Object.fromEntries(answers.map((a) => [a.itemId, a.clientSeq])) },
  latest: { ...queue.latest, ...Object.fromEntries(answers.map((a) => [a.itemId, a])) },
});

/** Câu trả lời mới nhất của từng câu, theo thứ tự câu được chạm lần đầu. */
export const knownAnswers = (queue: QueueState): SaveItem[] => Object.values(queue.latest);

/** Gộp hai thay đổi của cùng một câu: trường của bản mới thắng, `clientSeq` lấy bản mới. */
function merged(older: SaveItem, newer: SaveItem): SaveItem {
  const result: SaveItem = { itemId: newer.itemId, clientSeq: newer.clientSeq };
  const value = newer.value !== undefined ? newer.value : older.value;
  const flagged = newer.flagged !== undefined ? newer.flagged : older.flagged;
  if (value !== undefined) result.value = value;
  if (flagged !== undefined) result.flagged = flagged;
  return result;
}

function withItem(list: SaveItem[], incoming: SaveItem, incomingIsNewer: boolean): SaveItem[] {
  const index = list.findIndex((item) => item.itemId === incoming.itemId);
  if (index < 0) return [...list, incoming];
  const existing = list[index] as SaveItem;
  const next = incomingIsNewer ? merged(existing, incoming) : merged(incoming, existing);
  return list.map((item, i) => (i === index ? next : item));
}

export function enqueue(queue: QueueState, change: Change): QueueState {
  const clientSeq = (queue.seqs[change.itemId] ?? 0) + 1;
  const item: SaveItem = { ...change, clientSeq };
  return {
    ...queue,
    seqs: { ...queue.seqs, [change.itemId]: clientSeq },
    latest: {
      ...queue.latest,
      [change.itemId]: queue.latest[change.itemId]
        ? merged(queue.latest[change.itemId] as SaveItem, item)
        : item,
    },
    pending: withItem(queue.pending, item, true),
  };
}

/** Lấy lô kế tiếp để gửi; còn lô đang bay thì chưa gửi lô mới (giữ thứ tự, tránh chồng nhau). */
export function nextBatch(queue: QueueState): { batch: SaveItem[]; queue: QueueState } {
  if (queue.inflight.length > 0 || queue.pending.length === 0) return { batch: [], queue };
  const batch = queue.pending.slice(0, MAX_BATCH);
  return {
    batch,
    queue: { ...queue, pending: queue.pending.slice(MAX_BATCH), inflight: batch },
  };
}

/** Server đã trả kết quả từng câu: `saved` và `stale` đều là đã bền; `rejected` bị gỡ và ghi lại để báo. */
export function ack(queue: QueueState, results: ItemResult[]): QueueState {
  const answered = new Map(results.map((result) => [result.itemId, result]));
  let pending = queue.pending;
  const latest = { ...queue.latest };
  const rejected = [...queue.rejected];
  for (const item of queue.inflight) {
    const result = answered.get(item.itemId);
    if (!result) pending = withItem(pending, item, false);
    else if (result.status === 'rejected') {
      rejected.push({ itemId: item.itemId, reason: result.reason });
      if (latest[item.itemId]?.clientSeq === item.clientSeq) delete latest[item.itemId];
    }
  }
  return { ...queue, pending, latest, inflight: [], failures: 0, rejected };
}

/** Gửi lỗi (mạng, 5xx): lô quay lại hàng đợi; câu đã đổi ý trong lúc bay thì giữ bản mới. */
export function fail(queue: QueueState): QueueState {
  let pending = queue.pending;
  for (const item of queue.inflight) pending = withItem(pending, item, false);
  return { ...queue, pending, inflight: [], failures: queue.failures + 1 };
}

/** Mọi thay đổi server chưa xác nhận (lô đang bay + phần chờ): phần cần giữ qua IndexedDB để tải lại trang không mất. */
export function unsentOf(queue: QueueState): SaveItem[] {
  let items = queue.pending;
  for (const item of queue.inflight) items = withItem(items, item, false);
  return items;
}

/** Chờ bao lâu trước lần gửi lại: 1, 2, 4, 8 giây, tối đa 15 giây. */
export const retryDelayMs = (failures: number) => Math.min(15_000, 1000 * 2 ** (failures - 1));

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'offline';

export function saveStatusOf(queue: QueueState, online: boolean): SaveStatus {
  if (queue.pending.length === 0 && queue.inflight.length === 0) return 'saved';
  if (!online) return 'offline';
  return queue.failures > 0 ? 'unsaved' : 'saving';
}
