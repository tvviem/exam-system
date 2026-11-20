import { textDoc } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// R2 (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 8, S3): tỷ lệ rút mặc định của từng Phần khi soạn Bộ đề (Q438 đến Q441).

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

interface Section {
  id: string;
  drawPercent: number;
  items: { questionId: string; points: number }[];
}

/** Bộ đề nháp hai Phần (A: hai câu 1 điểm, B: hai câu 1 điểm); `shape` đổi điểm hoặc tỷ lệ. */
async function setup() {
  const topic = (await api('POST', '/topics', { name: 'Rút câu' })).json();
  const ids: string[] = [];
  for (const stem of ['A1', 'A2', 'B1', 'B2']) {
    const created = await api('POST', '/questions', singleChoice(topic.id, { stem }));
    expect(created.statusCode, created.body).toBe(201);
    ids.push(created.json().id);
  }
  const exam = (await api('POST', '/exams', { title: 'Bộ đề rút câu' })).json();
  return { examId: exam.id as string, firstSection: exam.sections[0].id as string, ids };
}

type SectionBody = { id?: string; drawPercent?: number; points?: number[] };
const save = async (
  ctx: Awaited<ReturnType<typeof setup>>,
  sections: SectionBody[],
  version?: number,
) => {
  const current = (await api('GET', `/exams/${ctx.examId}`)).json();
  let next = 0;
  return api('PUT', `/exams/${ctx.examId}`, {
    title: 'Bộ đề rút câu',
    instructions: textDoc(''),
    version: version ?? current.version,
    sections: sections.map((section, index) => ({
      ...(section.id ? { id: section.id } : index === 0 ? { id: ctx.firstSection } : {}),
      title: `Phần ${index + 1}`,
      instructions: textDoc(''),
      ...(section.drawPercent === undefined ? {} : { drawPercent: section.drawPercent }),
      items: (section.points ?? [1, 1]).map((points) => ({
        questionId: ctx.ids[next++] as string,
        points,
      })),
    })),
  });
};
const sectionsOf = async (examId: string) =>
  ((await api('GET', `/exams/${examId}`)).json().sections as Section[]).map((s) => ({
    id: s.id,
    drawPercent: s.drawPercent,
  }));

describe('lưu và đọc tỷ lệ rút của Phần khi soạn Bộ đề nháp', () => {
  it('lưu rồi đọc lại đúng; Phần không nêu hoặc 100 % đọc ra 100 và không có dòng trong bảng', async () => {
    const ctx = await setup();
    const saved = await save(ctx, [{ drawPercent: 40.5 }, {}]);
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await sectionsOf(ctx.examId)).map((s) => s.drawPercent)).toEqual([40.5, 100]);

    const again = await save(ctx, [{ drawPercent: 100 }, { drawPercent: 25 }]);
    expect(again.statusCode, again.body).toBe(200);
    expect((await sectionsOf(ctx.examId)).map((s) => s.drawPercent)).toEqual([100, 25]);
    expect(await sql(`select 1 from exam_section_draws`)).toHaveLength(1); // chỉ Phần dưới 100 % có dòng
  });

  it('0 % là giá trị thật và lưu được; bỏ trường thì về 100 %', async () => {
    const ctx = await setup();
    await save(ctx, [{ drawPercent: 0 }, { drawPercent: 50 }]);
    expect((await sectionsOf(ctx.examId)).map((s) => s.drawPercent)).toEqual([0, 50]);
    await save(ctx, [{}, {}]);
    expect((await sectionsOf(ctx.examId)).map((s) => s.drawPercent)).toEqual([100, 100]);
  });

  it('tỷ lệ ngoài 0 đến 100 hoặc quá hai chữ số lẻ bị từ chối, không đổi gì', async () => {
    const ctx = await setup();
    for (const bad of [101, -1, 33.333]) {
      const res = await save(ctx, [{ drawPercent: bad }, {}]);
      expect(res.statusCode, `${bad}`).toBe(400);
    }
    expect(await sql(`select 1 from exam_section_draws`)).toHaveLength(0);
  });

  it('Phần giữ id thì giữ tỷ lệ khi lưu lại; Phần bị bỏ thì tỷ lệ đi theo', async () => {
    const ctx = await setup();
    await save(ctx, [{ drawPercent: 40 }, { drawPercent: 60 }]);
    const [a] = await sectionsOf(ctx.examId);
    await save(ctx, [{ id: a?.id, drawPercent: 40, points: [1, 1, 1, 1] }]);
    expect((await sectionsOf(ctx.examId)).map((s) => s.drawPercent)).toEqual([40]);
    expect(await sql(`select 1 from exam_section_draws`)).toHaveLength(1);
  });
});

describe('Phát hành: quy tắc điểm đồng nhất và chặn mọi Phần 0 % (Q440, Q441)', () => {
  const check = async (examId: string) =>
    (await api('GET', `/exams/${examId}/publish-check`)).json().problems as {
      code: string;
      sectionId?: string;
    }[];

  it('Phần rút dưới 100 % mà các câu khác điểm là vấn đề chặn Phát hành, kèm Phần lệch; sửa điểm xong thì Phát hành được', async () => {
    const ctx = await setup();
    await save(ctx, [
      { drawPercent: 40, points: [1, 2] },
      { drawPercent: 100, points: [1, 3] },
    ]);
    const [a, b] = await sectionsOf(ctx.examId);

    expect(await check(ctx.examId)).toEqual([{ code: 'draw_points_uneven', sectionId: a?.id }]);
    const blocked = await api('POST', `/exams/${ctx.examId}/publish`, {
      version: (await api('GET', `/exams/${ctx.examId}`)).json().version,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      reason: 'PUBLISH_BLOCKED',
      problems: [{ code: 'draw_points_uneven', sectionId: a?.id }],
    });
    expect(b?.id).toBeTruthy(); // Phần B khác điểm nhưng đủ 100 % nên không bị báo

    await save(ctx, [
      { drawPercent: 40, points: [2, 2] },
      { drawPercent: 100, points: [1, 3] },
    ]);
    expect(await check(ctx.examId)).toEqual([]);
    const published = await api('POST', `/exams/${ctx.examId}/publish`, {
      version: (await api('GET', `/exams/${ctx.examId}`)).json().version,
    });
    expect(published.statusCode, published.body).toBe(200);
  });

  it('mọi Phần 0 % khiến không câu nào được rút: chặn Phát hành', async () => {
    const ctx = await setup();
    await save(ctx, [{ drawPercent: 0 }, { drawPercent: 0 }]);
    expect(await check(ctx.examId)).toEqual([{ code: 'draw_all_zero' }]);
    await save(ctx, [{ drawPercent: 0 }, { drawPercent: 10 }]);
    expect(await check(ctx.examId)).toEqual([]);
  });

  it('không cấu hình tỷ lệ nào (Bộ đề như trước) thì không có vấn đề rút, dù điểm các câu khác nhau', async () => {
    const ctx = await setup();
    await save(ctx, [{ points: [1, 5] }, { points: [2, 3] }]);
    expect(await check(ctx.examId)).toEqual([]);
  });
});

describe('Nhân bản và Bộ đề đã Phát hành', () => {
  it('Nhân bản Bộ đề đã Phát hành mang theo tỷ lệ rút mặc định sang bản nháp mới', async () => {
    const ctx = await setup();
    await save(ctx, [{ drawPercent: 40 }, { drawPercent: 60 }]);
    const version = (await api('GET', `/exams/${ctx.examId}`)).json().version;
    expect((await api('POST', `/exams/${ctx.examId}/publish`, { version })).statusCode).toBe(200);

    const copy = (await api('POST', `/exams/${ctx.examId}/duplicate`)).json();
    expect((await sectionsOf(copy.id)).map((s) => s.drawPercent)).toEqual([40, 60]);
  });

  it('Bộ đề đã Phát hành vẫn đọc ra tỷ lệ đã đóng băng', async () => {
    const ctx = await setup();
    await save(ctx, [{ drawPercent: 40 }, {}]);
    const version = (await api('GET', `/exams/${ctx.examId}`)).json().version;
    await api('POST', `/exams/${ctx.examId}/publish`, { version });
    expect((await sectionsOf(ctx.examId)).map((s) => s.drawPercent)).toEqual([40, 100]);
  });
});
