import { memoryStore, onlyUnsent } from './memory-store';
import type { QueueStore, StoredQueue, StoredView } from './offline-attempt';

// `QueueStore` thật trên IndexedDB (Q243): hai kho khóa theo id Lượt làm bài. Máy không có IndexedDB (chế độ riêng tư
// cũ) thì rơi về bộ nhớ trang: vẫn chạy nhưng `durable` là false để màn làm bài cảnh báo trước khi đóng tab.

const DB_NAME = 'exam-take';
const VIEWS = 'views';
const QUEUES = 'queues';

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(VIEWS);
      req.result.createObjectStore(QUEUES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function indexedStore(): QueueStore {
  let db: Promise<IDBDatabase> | undefined;
  const connection = () => {
    db ??= open().catch((error) => {
      db = undefined; // lần sau thử mở lại
      throw error;
    });
    return db;
  };
  return {
    async load(attemptId) {
      const tx = (await connection()).transaction([VIEWS, QUEUES], 'readonly');
      const [view, queue] = await Promise.all([
        request<StoredView | undefined>(tx.objectStore(VIEWS).get(attemptId)),
        request<StoredQueue | undefined>(tx.objectStore(QUEUES).get(attemptId)),
      ]);
      return { view, queue };
    },
    async saveView(attemptId, value) {
      const tx = (await connection()).transaction(VIEWS, 'readwrite');
      tx.objectStore(VIEWS).put(value, attemptId);
      await finished(tx);
    },
    async saveQueue(attemptId, value) {
      const tx = (await connection()).transaction(QUEUES, 'readwrite');
      tx.objectStore(QUEUES).put(value, attemptId);
      await finished(tx);
    },
    async forget(attemptId) {
      const tx = (await connection()).transaction([VIEWS, QUEUES], 'readwrite');
      tx.objectStore(VIEWS).delete(attemptId);
      tx.objectStore(QUEUES).delete(attemptId);
      await finished(tx);
    },
    async forgetAll(keepUnsent) {
      const tx = (await connection()).transaction([VIEWS, QUEUES], 'readwrite');
      tx.objectStore(VIEWS).clear();
      const queues = tx.objectStore(QUEUES);
      if (!keepUnsent) queues.clear();
      else {
        const cursor = queues.openCursor();
        cursor.onsuccess = () => {
          const at = cursor.result;
          if (!at) return;
          const queue = at.value as StoredQueue;
          if (queue.items.length === 0) at.delete();
          else at.update(onlyUnsent(queue)); // câu đã gửi xong không cần giữ sau đăng xuất
          at.continue();
        };
      }
      await finished(tx);
    },
  };
}

const hasIndexedDb = typeof indexedDB !== 'undefined';

/** Kho dùng chung của khu làm bài. */
export const takeStore: QueueStore = hasIndexedDb ? indexedStore() : memoryStore();
/** `false` khi chỉ giữ được trong bộ nhớ trang: tải lại hay đóng tab là mất phần chưa gửi. */
export const takeStoreDurable = hasIndexedDb;
