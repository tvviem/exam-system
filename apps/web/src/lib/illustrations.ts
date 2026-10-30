import { queryOptions } from '@tanstack/react-query';
import type { PageResult } from './admin';
import { apiFetch } from './api';

// Hình minh họa của Người ra đề (docs/plan/slice-2.md, Q137–Q142).

export interface Illustration {
  id: string;
  status: 'processing' | 'ready' | 'failed';
  failureReason: 'dimensions_too_large' | 'corrupt' | null;
  width: number | null;
  height: number | null;
  variants: number[];
  bytes: number;
  /** Có Câu hỏi đang dùng thì không xóa được. */
  inUse: boolean;
  createdAt: string;
}

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const IMAGE_ALT_MAX = 250;

/** Cạnh dài của các biến thể api phục vụ; `mediaSrcSet` để trình duyệt tự chọn cỡ vừa màn hình. */
const SIDES = [480, 960, 1600] as const;
export const mediaUrl = (id: string, side: (typeof SIDES)[number]) => `/api/media/${id}/${side}`;
export const mediaSrcSet = (id: string) =>
  SIDES.map((side) => `${mediaUrl(id, side)} ${side}w`).join(', ');

/** Còn ảnh đang xử lý trong trang thì hỏi lại mỗi giây để thumbnail hiện ra khi xong. */
export const illustrationsQuery = (page: number) =>
  queryOptions({
    queryKey: ['illustrations', { page }],
    queryFn: () => apiFetch<PageResult<Illustration>>(`/illustrations?page=${page}`),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'processing') ? 1000 : false,
  });

/** Hỏi lại mỗi giây cho đến khi worker xử lý xong. */
export const illustrationQuery = (id: string) =>
  queryOptions({
    queryKey: ['illustration', id],
    queryFn: () => apiFetch<Illustration>(`/illustrations/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 1000 : false),
  });

export function uploadIllustration(file: File) {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<Illustration & { reused: boolean }>('/illustrations', { method: 'POST', body });
}

export const deleteIllustration = (id: string) =>
  apiFetch<{ id: string }>(`/illustrations/${id}`, { method: 'DELETE' });

const UPLOAD_MAX_SIDE = 2_400;
const UPLOAD_QUALITY = 0.9;

/**
 * Thu nhỏ ảnh về cạnh dài ≤ 2.400 px trước khi tải lên để tiết kiệm dữ liệu di động (Q142). Ảnh đã nhỏ giữ nguyên
 * file gốc (không nén lại). Không làm được thì gửi file gốc; server vẫn kiểm tra và mã hóa lại.
 */
export async function shrinkForUpload(file: File): Promise<File> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (longSide <= UPLOAD_MAX_SIDE) {
      bitmap.close();
      return file;
    }
    const scale = UPLOAD_MAX_SIDE / longSide;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    // PNG (sơ đồ, ảnh chụp màn hình) giữ không mất dữ liệu; còn lại là JPEG.
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, UPLOAD_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const extension = type === 'image/png' ? 'png' : 'jpg';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, { type });
  } catch {
    return file;
  }
}
