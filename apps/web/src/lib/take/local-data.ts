import { takeStore } from './idb-store';

// Dọn dữ liệu làm bài còn trên máy (Q243): bản sao đề, hàng đợi và ảnh đã lưu đệm.

/** Tên kho lưu đệm ảnh đề; trùng với `public/sw.js`. */
export const MEDIA_CACHE = 'exam-take-media';

async function dropMedia(prefix?: string) {
  if (typeof caches === 'undefined') return;
  try {
    if (!prefix) {
      await caches.delete(MEDIA_CACHE);
      return;
    }
    const cache = await caches.open(MEDIA_CACHE);
    for (const request of await cache.keys()) {
      if (new URL(request.url).pathname.startsWith(prefix)) await cache.delete(request);
    }
  } catch {
    // Cache Storage không dùng được: không có gì để dọn.
  }
}

/** Lượt đã nộp hoặc đóng, hay không còn: bỏ mọi thứ của Lượt này. */
export async function forgetAttemptLocally(attemptId: string) {
  await Promise.allSettled([
    takeStore.forget(attemptId),
    dropMedia(`/api/take-media/${attemptId}/`),
  ]);
}

/** Đăng xuất: bỏ bản sao đề và ảnh, chỉ giữ hàng đợi còn câu chưa gửi để đăng nhập lại gửi nốt. */
export async function forgetOnLogout() {
  await Promise.allSettled([takeStore.forgetAll(true), dropMedia()]);
}
