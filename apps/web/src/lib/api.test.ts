import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api';
import { questionsQuery, topicsQuery } from './question-bank';

// Gõ tiếp vào ô tìm thì yêu cầu cũ phải bị bỏ: máy chủ chỉ chạy vài truy vấn danh sách cùng lúc cho mỗi người
// (docs/plan/quy-mo-lon-thiet-ke.md mục 6.2).

describe('hủy yêu cầu cũ', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = () => {
    const fetch = vi.fn(
      async () => new Response('{"items":[]}', { headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetch);
    return fetch;
  };

  it('apiFetch chuyển tín hiệu hủy xuống fetch', async () => {
    const fetch = stubFetch();
    const abort = new AbortController();
    await apiFetch('/questions', { signal: abort.signal });
    expect(fetch).toHaveBeenCalledWith(
      '/api/questions',
      expect.objectContaining({ signal: abort.signal }),
    );
  });

  it('truy vấn danh sách dùng tín hiệu hủy của TanStack Query', async () => {
    const fetch = stubFetch();
    const abort = new AbortController();
    for (const query of [questionsQuery({ q: 'cay' }), topicsQuery()]) {
      const run = query.queryFn as (context: { signal: AbortSignal }) => Promise<unknown>;
      await run({ signal: abort.signal });
    }
    expect(fetch.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      expect.objectContaining({ signal: abort.signal }),
      expect.objectContaining({ signal: abort.signal }),
    ]);
  });
});
