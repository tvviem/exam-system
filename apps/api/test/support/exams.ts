import { textDoc } from '@exam/shared';
import { expect } from 'vitest';
import type { TestApp } from './app';
import { call } from './http';
import { singleChoice } from './question-bank';

export interface ExamRef {
  id: string;
  title: string;
}

/** Bộ đề đã Phát hành (2 câu chọn một) của người đăng nhập bằng `cookie`, dựng qua API. */
export async function publishedExam(
  t: TestApp,
  cookie: string,
  title = 'Giữa kỳ Giải tích',
): Promise<ExamRef> {
  const api = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
    call(t.app, method, `/api${path}`, { cookie, body });
  const topic = await api('POST', '/topics', { name: `Chủ đề ${title}` });
  expect(topic.statusCode, topic.body).toBe(201);
  const questionIds: string[] = [];
  for (const stem of ['Câu 1', 'Câu 2']) {
    const created = await api('POST', '/questions', singleChoice(topic.json().id, { stem }));
    expect(created.statusCode, created.body).toBe(201);
    questionIds.push(created.json().id);
  }
  const created = (await api('POST', '/exams', { title })).json();
  const saved = await api('PUT', `/exams/${created.id}`, {
    title,
    instructions: textDoc(''),
    version: created.version,
    sections: [
      {
        id: created.sections[0].id,
        title: null,
        instructions: textDoc(''),
        items: questionIds.map((questionId) => ({ questionId, points: 1 })),
      },
    ],
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const published = await api('POST', `/exams/${created.id}/publish`, {
    version: saved.json().version,
  });
  expect(published.statusCode, published.body).toBe(200);
  return { id: created.id, title };
}
