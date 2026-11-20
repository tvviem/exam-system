import { textDoc } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// R2 (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 8, S2): bảng exam_section_draws (tỷ lệ rút mặc định ở Bộ đề) và trigger khóa.

let t: TestApp;
let cookie: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
});

const api = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
  call(t.app, method, `/api${path}`, { cookie, body });

/** Bộ đề nháp có hai Phần, mỗi Phần hai câu; trả mã Bộ đề và mã hai Phần. */
async function draftExam() {
  const topic = (await api('POST', '/topics', { name: 'Rút câu' })).json();
  const questions: string[] = [];
  for (const stem of ['A1', 'A2', 'B1', 'B2']) {
    const created = await api('POST', '/questions', singleChoice(topic.id, { stem }));
    expect(created.statusCode, created.body).toBe(201);
    questions.push(created.json().id);
  }
  const exam = (await api('POST', '/exams', { title: 'Bộ đề rút câu' })).json();
  const firstSection = exam.sections[0].id as string;
  const saved = await api('PUT', `/exams/${exam.id}`, {
    title: 'Bộ đề rút câu',
    instructions: textDoc(''),
    version: exam.version,
    sections: [
      {
        id: firstSection,
        title: 'Phần A',
        instructions: textDoc(''),
        items: questions.slice(0, 2).map((questionId) => ({ questionId, points: 1 })),
      },
      {
        title: 'Phần B',
        instructions: textDoc(''),
        items: questions.slice(2).map((questionId) => ({ questionId, points: 1 })),
      },
    ],
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const detail = (await api('GET', `/exams/${exam.id}`)).json();
  return {
    examId: exam.id as string,
    sections: detail.sections.map((s: { id: string }) => s.id) as string[],
    version: detail.version as number,
  };
}

const rows = (examId: string) =>
  sql<{ section_id: string; percent: string }>(
    `select d.section_id, d.percent from exam_section_draws d
       join exam_sections s on s.id = d.section_id where s.exam_id = $1 order by s.sort`,
    [examId],
  );

describe('exam_section_draws: tỷ lệ rút mặc định của Phần ở Bộ đề nháp', () => {
  it('ghi và đọc được khi Bộ đề còn nháp; mỗi Phần tối đa một dòng', async () => {
    const { examId, sections } = await draftExam();
    await sql(`insert into exam_section_draws (section_id, percent) values ($1, 40.5)`, [
      sections[0],
    ]);
    expect((await rows(examId)).map((r) => Number(r.percent))).toEqual([40.5]);
    await expect(
      sql(`insert into exam_section_draws (section_id, percent) values ($1, 50)`, [sections[0]]),
    ).rejects.toThrow(/duplicate|unique|pkey/i);
  });

  it('tỷ lệ phải từ 0 đến 100', async () => {
    const { sections } = await draftExam();
    for (const bad of ['-0.01', '100.01', '150']) {
      await expect(
        sql(`insert into exam_section_draws (section_id, percent) values ($1, ${bad})`, [
          sections[0],
        ]),
      ).rejects.toThrow(/check/i);
    }
    await sql(`insert into exam_section_draws (section_id, percent) values ($1, 0), ($2, 100)`, [
      sections[0],
      sections[1],
    ]);
  });

  it('Bộ đề đã Phát hành thì bất biến: không thêm, sửa, xóa dòng nào (kể cả SQL ghi trực tiếp, Q439)', async () => {
    const { examId, sections, version } = await draftExam();
    await sql(`insert into exam_section_draws (section_id, percent) values ($1, 40)`, [
      sections[0],
    ]);
    const published = await api('POST', `/exams/${examId}/publish`, { version });
    expect(published.statusCode, published.body).toBe(200);

    await expect(
      sql(`insert into exam_section_draws (section_id, percent) values ($1, 50)`, [sections[1]]),
    ).rejects.toThrow(/phat hanh/i);
    await expect(
      sql(`update exam_section_draws set percent = 60 where section_id = $1`, [sections[0]]),
    ).rejects.toThrow(/phat hanh/i);
    await expect(
      sql(`delete from exam_section_draws where section_id = $1`, [sections[0]]),
    ).rejects.toThrow(/phat hanh/i);
    expect((await rows(examId)).map((r) => Number(r.percent))).toEqual([40]);
  });

  it('Bộ đề đã Lưu trữ cũng bất biến', async () => {
    const { examId, sections, version } = await draftExam();
    await sql(`insert into exam_section_draws (section_id, percent) values ($1, 40)`, [
      sections[0],
    ]);
    await api('POST', `/exams/${examId}/publish`, { version });
    expect((await api('POST', `/exams/${examId}/archive`)).statusCode).toBe(200);
    await expect(
      sql(`update exam_section_draws set percent = 60 where section_id = $1`, [sections[0]]),
    ).rejects.toThrow(/phat hanh/i);
  });

  it('xóa Phần hoặc xóa Bộ đề nháp thì dòng tỷ lệ đi theo (không treo)', async () => {
    const { examId, sections } = await draftExam();
    await sql(`insert into exam_section_draws (section_id, percent) values ($1, 40), ($2, 60)`, [
      sections[0],
      sections[1],
    ]);
    await sql(`delete from exam_items where section_id = $1`, [sections[1]]);
    await sql(`delete from exam_sections where id = $1`, [sections[1]]);
    expect((await rows(examId)).length).toBe(1);

    expect((await api('DELETE' as never, `/exams/${examId}`)).statusCode).toBeLessThan(300);
    expect(await sql(`select 1 from exam_section_draws`)).toHaveLength(0);
  });
});
