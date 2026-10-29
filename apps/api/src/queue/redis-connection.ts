import type { ConnectionOptions } from 'bullmq';

export const JOB_QUEUE_NAME = 'jobs';

/** BullMQ nhận tùy chọn kết nối thay vì đối tượng ioredis, để không phụ thuộc phiên bản ioredis của nó. */
export function bullmqConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(url.pathname.slice(1) || 0),
    maxRetriesPerRequest: null, // BullMQ yêu cầu để lệnh chờ khi Redis chập chờn
  };
}
