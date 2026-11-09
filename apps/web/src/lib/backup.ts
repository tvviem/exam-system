import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { PageResult } from './admin';
import { apiFetch } from './api';
import { queryString } from './query-string';

export interface BackupRun {
  id: string;
  kind: string;
  status: 'ok' | 'failed';
  finishedAt: string;
  seconds: number | null;
  bytes: number | null;
  detail: string | null;
}

export interface BackupOverview {
  summary: {
    nightly: BackupRun | null;
    base: BackupRun | null;
    restoreTest: BackupRun | null;
    /** Việc có dòng mới nhất là lỗi (chưa có dòng thành công hoặc phục hồi sau đó). */
    issues: BackupRun[];
  };
  runs: PageResult<BackupRun>;
}

/** Bản đêm cũ hơn mức này thì hiện cảnh báo (cùng mức với chuông ở máy chủ, Q363). */
export const STALE_AFTER_HOURS = 26;

/** Màn hình chỉ đọc (Q365); hỏi lại mỗi phút để thấy kết quả mới mà không phải tải lại trang. */
export const backupQuery = (params: { page?: number }) =>
  queryOptions({
    queryKey: ['admin', 'backup', params],
    queryFn: () => apiFetch<BackupOverview>(`/admin/backup${queryString({ ...params })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
