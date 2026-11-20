import { textDoc } from '@exam/shared';
import { expect } from 'vitest';
import type { TestApp } from './app';
import { sql } from './db';
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

export interface DrawSectionSpec {
  /** Tỷ lệ rút mặc định của Phần ở Bộ đề; bỏ trống là 100 %. */
  drawPercent?: number;
  /** Điểm từng câu của Phần (số phần tử là số câu). */
  points: number[];
}

export interface DrawExamRef extends ExamRef {
  sectionIds: string[];
  /** Mã câu trong Bộ đề (exam_items.id), theo thứ tự Phần rồi thứ tự câu. */
  itemIds: string[];
}

/** Bộ đề đã Phát hành nhiều Phần, mỗi Phần có số câu, điểm và tỷ lệ rút mặc định riêng (R2). */
export async function publishedDrawExam(
  t: TestApp,
  cookie: string,
  sections: DrawSectionSpec[],
  title = 'Bộ đề rút câu',
): Promise<DrawExamRef> {
  const api = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
    call(t.app, method, `/api${path}`, { cookie, body });
  const topic = (await api('POST', '/topics', { name: `Chủ đề ${title}` })).json();
  const created = (await api('POST', '/exams', { title })).json();
  let n = 0;
  const body = [];
  for (const [index, section] of sections.entries()) {
    const items = [];
    for (const points of section.points) {
      const question = await api(
        'POST',
        '/questions',
        singleChoice(topic.id, { stem: `Câu ${++n}` }),
      );
      expect(question.statusCode, question.body).toBe(201);
      items.push({ questionId: question.json().id, points });
    }
    body.push({
      ...(index === 0 ? { id: created.sections[0].id } : {}),
      title: `Phần ${index + 1}`,
      instructions: textDoc(''),
      ...(section.drawPercent === undefined ? {} : { drawPercent: section.drawPercent }),
      items,
    });
  }
  const saved = await api('PUT', `/exams/${created.id}`, {
    title,
    instructions: textDoc(''),
    version: created.version,
    sections: body,
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const published = await api('POST', `/exams/${created.id}/publish`, {
    version: saved.json().version,
  });
  expect(published.statusCode, published.body).toBe(200);
  const detail = (await api('GET', `/exams/${created.id}`)).json();
  return {
    id: created.id,
    title,
    sectionIds: detail.sections.map((s: { id: string }) => s.id),
    itemIds: await itemIdsOf(created.id),
  };
}

async function itemIdsOf(examId: string): Promise<string[]> {
  const rows = await sql<{ id: string }>(
    `select i.id from exam_items i join exam_sections s on s.id = i.section_id
      where i.exam_id = $1 order by s.sort, i.sort`,
    [examId],
  );
  return rows.map((row) => row.id);
}
