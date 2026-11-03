/** Lỗi từ api dạng `{ code, ...details }`; giao diện dịch `code` qua i18n (`errors.<code>`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  // FormData (tải file lên) để trình duyệt tự đặt content-type kèm boundary.
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined || isForm ? {} : { 'content-type': 'application/json' },
    body:
      init.body === undefined
        ? undefined
        : isForm
          ? (init.body as FormData)
          : JSON.stringify(init.body),
  });
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;
  if (!res.ok) {
    const { code = 'UNKNOWN', ...details } = (data ?? {}) as { code?: string };
    throw new ApiError(res.status, code, details);
  }
  return data as T;
}

/** Không tới được server: mất mạng (fetch ném lỗi) hoặc cổng web báo 502/503/504. */
export const isUnreachable = (error: unknown) =>
  !(error instanceof ApiError) || [502, 503, 504].includes(error.status);
