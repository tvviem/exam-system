import type { QueueStore, StoredQueue, StoredView } from './offline-attempt';

/** `QueueStore` trong bộ nhớ: dự phòng khi máy không có IndexedDB, và dùng làm kho giả trong kiểm thử. */
export function memoryStore() {
  const views = new Map<string, StoredView>();
  const queues = new Map<string, StoredQueue>();
  const store: QueueStore = {
    load: async (id) => ({ view: views.get(id), queue: queues.get(id) }),
    saveView: async (id, value) => void views.set(id, value),
    saveQueue: async (id, value) => void queues.set(id, value),
    forget: async (id) => {
      views.delete(id);
      queues.delete(id);
    },
    forgetAll: async (keepUnsent) => {
      views.clear();
      for (const [id, queue] of queues) {
        if (keepUnsent && queue.items.length > 0) queues.set(id, onlyUnsent(queue));
        else queues.delete(id);
      }
    },
  };
  return { ...store, views, queues };
}

/** Còn lại sau đăng xuất: chỉ phần chưa gửi (câu đã gửi xong không cần giữ, và người dùng sau không được đọc). */
export const onlyUnsent = (queue: StoredQueue): StoredQueue => ({
  answers: queue.items,
  items: queue.items,
});
