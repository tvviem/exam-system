import { expect, type Page } from '@playwright/test';
import { ORIGIN } from './take-support';

// Dựng dữ liệu cho các spec Mã đề (V3b trở đi): Bộ đề 8 câu đã Phát hành và Phiên thi đang mở có 4 Người dự thi cùng Lớp.

const headers = { origin: ORIGIN };
const rich = (text: string) => ({
  type: 'doc',
  content: [
    text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' },
  ],
});

export const uniqueCode = (p: string) =>
  `MW${p[0]?.toUpperCase()}${Date.now().toString(36)}`.toUpperCase().slice(0, 12);

/**
 * Bộ đề 8 câu đã Phát hành và một Phiên thi đang mở có `variantCount` Mã đề (dùng chung) hoặc mỗi người một đề, kèm 4 Người dự thi
 * trong Danh sách. Dựng bằng API của Người ra đề.
 */
export async function seedSession(
  page: Page,
  p: string,
  tag: string,
  options: { shared: boolean; variantCount?: number },
) {
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const topic = await post('/api/topics', { name: `Chủ đề ${tag}` });
  const ids: string[] = [];
  for (let n = 1; n <= 8; n++) {
    const q = await post('/api/questions', {
      type: 'single_choice',
      topicId: topic.id,
      stem: rich(`Câu hỏi số ${n}`),
      defaultPoints: 1,
      tags: [],
      payload: {
        options: [
          { id: 'o1', content: rich('a') },
          { id: 'o2', content: rich('b') },
        ],
        key: ['o1'],
        shuffleOptions: false,
      },
    });
    ids.push(q.id);
  }
  const exam = await post('/api/exams', { title: tag });
  const saved = await page.request.put(`/api/exams/${exam.id}`, {
    headers,
    data: {
      title: tag,
      instructions: rich(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: 'Phần I',
          instructions: rich(''),
          items: ids.map((questionId) => ({ questionId, points: 1 })),
        },
      ],
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await post(`/api/exams/${exam.id}/publish`, { version: (await saved.json()).version });
  const now = Date.now();
  const code = uniqueCode(p);
  const session = await post('/api/sessions', {
    examId: exam.id,
    title: `Ca ${tag}`,
    opensAt: new Date(now - 10 * 60_000).toISOString(),
    closesAt: new Date(now + 4 * 3_600_000).toISOString(),
    durationMinutes: 30,
    accessCode: code,
    ...(options.shared
      ? { drawScope: 'shared', variantCount: options.variantCount ?? 1 }
      : { drawScope: 'per_candidate' }),
  });
  await post(`/api/sessions/${session.id}/roster`, {
    classLabel: `LOP-MDW-${p === 'desktop' ? 'D' : 'M'}`,
  });
  return { id: session.id as string, code, title: `Ca ${tag}` };
}
