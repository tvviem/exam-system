import { type QuestionInput, type RichText, textDoc } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login, upload } from './support/http';
import { jpeg } from './support/images';
import { singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let cookie: string;
let otherCookie: string;
let topicId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  topicId = (
    await call(t.app, 'POST', '/api/topics', { cookie, body: { name: 'Giải tích' } })
  ).json().id;
});

const api = (method: string, path: string, body?: unknown, who = cookie) =>
  call(t.app, method as 'GET', `/api${path}`, { cookie: who, body });

async function question(stem = 'Câu hỏi', input?: QuestionInput) {
  const res = await api('POST', '/questions', input ?? singleChoice(topicId, { stem }));
  expect(res.statusCode, res.body).toBe(201);
  return res.json().id as string;
}

/** Bộ đề nháp đã lưu với các câu (mỗi câu 1 điểm) trong một Phần. */
async function draftExam(questionIds: string[], title = 'Giữa kỳ') {
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
  return saved.json();
}

const publish = (exam: { id: string; version: number }, who = cookie) =>
  api('POST', `/exams/${exam.id}/publish`, { version: exam.version }, who);
const check = (id: string) => api('GET', `/exams/${id}/publish-check`);

describe('kiểm tra trước khi Phát hành (Q171)', () => {
  it('Bộ đề không có câu: empty_exam', async () => {
    const created = (await api('POST', '/exams', { title: 'Rỗng' })).json();
    expect((await check(created.id)).json().problems).toEqual([{ code: 'empty_exam' }]);
  });

  it('Phần không có câu: empty_section kèm id Phần', async () => {
    const exam = await draftExam([await question('A')]);
    const saved = await api('PUT', `/exams/${exam.id}`, {
      title: 'Giữa kỳ',
      instructions: textDoc(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: 'I',
          instructions: textDoc(''),
          items: exam.sections[0].items.map((i: { questionId: string; points: number }) => ({
            questionId: i.questionId,
            points: i.points,
          })),
        },
        { title: 'II', instructions: textDoc(''), items: [] },
      ],
    });
    const problems = (await check(exam.id)).json().problems;
    expect(problems).toEqual([{ code: 'empty_section', sectionId: saved.json().sections[1].id }]);
  });

  it('câu đã Lưu trữ: question_archived; sau khi Khôi phục thì hết', async () => {
    const q = await question('A');
    const exam = await draftExam([q]);
    await api('POST', '/questions/archive', { ids: [q] });
    expect((await check(exam.id)).json().problems).toMatchObject([
      { code: 'question_archived', questionId: q },
    ]);
    await api('POST', '/questions/restore', { ids: [q] });
    expect((await check(exam.id)).json().problems).toEqual([]);
  });

  it('câu không còn hợp lệ (dữ liệu hỏng): question_invalid', async () => {
    const q = await question('A');
    const exam = await draftExam([q]);
    await sql(`update questions set payload = '{"options":[]}'::jsonb where id = $1`, [q]);
    expect((await check(exam.id)).json().problems).toMatchObject([
      { code: 'question_invalid', questionId: q },
    ]);
  });

  it('ảnh chưa sẵn sàng: illustration_not_ready', async () => {
    const res = await upload(
      t.app,
      '/api/illustrations',
      { filename: 'h.jpg', content: await jpeg(400, 300) },
      { cookie },
    );
    const imageId = res.json().id as string;
    await t.queue.drain();
    const q = await question('A', imageQuestion(imageId));
    const exam = await draftExam([q]);
    expect((await check(exam.id)).json().problems).toEqual([]);
    await sql(`update illustrations set status = 'failed' where id = $1`, [imageId]);
    expect((await check(exam.id)).json().problems).toMatchObject([
      { code: 'illustration_not_ready', questionId: q },
    ]);
  });

  it('chỉ chủ và chỉ Bộ đề nháp', async () => {
    const exam = await draftExam([await question('A')]);
    expect(
      (await api('GET', `/exams/${exam.id}/publish-check`, undefined, otherCookie)).statusCode,
    ).toBe(404);
    await publish(exam);
    const again = await check(exam.id);
    expect(again.statusCode).toBe(409);
    expect(again.json().reason).toBe('EXAM_NOT_DRAFT');
  });
});

const imageQuestion = (illustrationId: string): QuestionInput => ({
  ...singleChoice(topicId),
  stem: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Xem hình' }] },
      { type: 'image', attrs: { illustrationId, alt: 'Hình' } },
    ],
  } as RichText,
});

describe('Phát hành và bản chụp (Q172, Q173)', () => {
  it('có vấn đề thì PUBLISH_BLOCKED kèm danh sách và không đổi gì', async () => {
    const created = (await api('POST', '/exams', { title: 'Rỗng' })).json();
    const res = await publish(created);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      reason: 'PUBLISH_BLOCKED',
      problems: [{ code: 'empty_exam' }],
    });
    expect((await api('GET', `/exams/${created.id}`)).json().status).toBe('draft');
  });

  it('version lệch là CONFLICT; của người khác là NOT_FOUND', async () => {
    const exam = await draftExam([await question('A')]);
    const stale = await api('POST', `/exams/${exam.id}/publish`, { version: exam.version - 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'CONFLICT', field: 'version' });
    expect((await publish(exam, otherCookie)).statusCode).toBe(404);
  });

  it('Phát hành ghi bản chụp từng câu và chuyển trạng thái; sau đó không sửa, không xóa được', async () => {
    const q = await question('Đạo hàm');
    const exam = await draftExam([q]);
    expect((await publish(exam)).statusCode).toBe(200);

    const after = (await api('GET', `/exams/${exam.id}`)).json();
    expect(after).toMatchObject({ status: 'published' });
    expect(after.publishedAt).not.toBeNull();
    const [row] = await sql<{ snapshot: Record<string, unknown> }>(
      'select snapshot from exam_items where exam_id = $1',
      [exam.id],
    );
    expect(row?.snapshot).toMatchObject({
      questionId: q,
      questionVersion: 1,
      type: 'single_choice',
      payload: { key: ['o2'] }, // bản chụp có Đáp án đúng; chỉ server đọc (ADR-0005)
    });

    const put = await api('PUT', `/exams/${exam.id}`, {
      title: 'Đổi',
      instructions: textDoc(''),
      version: after.version,
      sections: [
        {
          id: after.sections[0].id,
          title: null,
          instructions: textDoc(''),
          items: [{ questionId: q, points: 1 }],
        },
      ],
    });
    expect(put.json().reason).toBe('EXAM_NOT_DRAFT');
    expect((await api('DELETE', `/exams/${exam.id}`)).json().reason).toBe('EXAM_NOT_DRAFT');
    expect((await publish(after)).json().reason).toBe('EXAM_NOT_DRAFT');
  });

  it('sửa Câu hỏi sau Phát hành không đổi bản chụp; Xem thử vẫn là bản cũ và không có Đáp án', async () => {
    const q = await question('Phần dẫn cũ');
    const exam = await draftExam([q]);
    await publish(exam);
    const current = (await api('GET', `/questions/${q}`)).json();
    const {
      id: _id,
      createdAt: _c,
      updatedAt: _u,
      usage: _usage,
      archivedAt: _a,
      ...rest
    } = current;
    const edit = await api('PUT', `/questions/${q}`, { ...rest, stem: textDoc('Phần dẫn mới') });
    expect(edit.statusCode, edit.body).toBe(200);

    const preview = await api('GET', `/exams/${exam.id}/preview`);
    expect(preview.body).toContain('Phần dẫn cũ');
    expect(preview.body).not.toContain('Phần dẫn mới');
    expect(preview.body).not.toContain('"key"');
  });

  it('hai lần Phát hành đồng thời: chỉ một lần thành công', async () => {
    const exam = await draftExam([await question('A')]);
    const results = await Promise.all([publish(exam), publish(exam)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const [counted] = await sql<{ n: string }>(
      `select count(*)::text as n from exam_items where exam_id = $1 and snapshot is not null`,
      [exam.id],
    );
    expect(counted?.n).toBe('1');
  });
});

describe('trigger chặn ghi trực tiếp vào Bộ đề đã Phát hành (Q172)', () => {
  it('UPDATE, INSERT, DELETE nội dung và quay về nháp đều bị từ chối; Lưu trữ vẫn được', async () => {
    const q = await question('A');
    const spare = await question('B');
    const exam = await draftExam([q]);
    await publish(exam);
    const failing = [
      `update exam_items set points = 9 where exam_id = '${exam.id}'`,
      `update exam_items set snapshot = '{}'::jsonb where exam_id = '${exam.id}'`,
      `delete from exam_items where exam_id = '${exam.id}'`,
      `insert into exam_items (id, exam_id, section_id, question_id, points, sort)
         select gen_random_uuid(), '${exam.id}', id, '${spare}', 1, 9 from exam_sections where exam_id = '${exam.id}'`,
      `update exam_sections set title = 'x' where exam_id = '${exam.id}'`,
      `delete from exam_sections where exam_id = '${exam.id}'`,
      `update exams set title = 'x' where id = '${exam.id}'`,
      `update exams set status = 'draft' where id = '${exam.id}'`,
      `delete from exams where id = '${exam.id}'`,
    ];
    for (const statement of failing) {
      await expect(sql(statement), statement).rejects.toThrow(/khong (sua|xoa) duoc/);
    }
    await expect(
      sql(`update exams set status = 'archived', archived_at = now() where id = '${exam.id}'`),
    ).resolves.toEqual([]);
  });

  it('Bộ đề nháp vẫn xóa được (cascade qua trigger)', async () => {
    const exam = await draftExam([await question('A')]);
    expect((await api('DELETE', `/exams/${exam.id}`)).statusCode).toBe(200);
  });
});

describe('Câu hỏi đã dùng: chỉ Lưu trữ (Q174, Q175)', () => {
  it('câu trong Bộ đề đã Phát hành không xóa được; Lưu trữ thì được và Bộ đề không đổi', async () => {
    const q = await question('A');
    const exam = await draftExam([q]);
    await publish(exam);
    const del = await api('POST', '/questions/delete', { ids: [q] });
    expect(del.statusCode).toBe(409);
    expect(del.json()).toMatchObject({ reason: 'QUESTION_IN_PUBLISHED_EXAM', publishedCount: 1 });

    expect((await api('POST', '/questions/archive', { ids: [q] })).json()).toEqual({ updated: 1 });
    expect((await api('GET', '/questions')).json().total).toBe(0);
    const archived = (await api('GET', '/questions?archived=true')).json();
    expect(archived.items.map((i: { id: string }) => i.id)).toEqual([q]);
    expect((await api('GET', `/exams/${exam.id}/preview`)).statusCode).toBe(200);

    await api('POST', '/questions/restore', { ids: [q] });
    expect((await api('GET', '/questions')).json().total).toBe(1);
  });

  it('câu chưa dùng vẫn xóa hẳn; Lưu trữ của người khác là NOT_FOUND', async () => {
    const q = await question('A');
    expect((await api('POST', '/questions/archive', { ids: [q] }, otherCookie)).statusCode).toBe(
      404,
    );
    expect((await api('POST', '/questions/delete', { ids: [q] })).statusCode).toBe(200);
  });

  it('danh sách và chi tiết Câu hỏi nêu dùng ở đâu', async () => {
    const q = await question('A');
    const draft = await draftExam([q], 'Nháp');
    const done = await draftExam([q], 'Xong');
    await publish(done);
    const item = (await api('GET', '/questions')).json().items[0];
    expect(item.usage).toEqual({ draftCount: 1, publishedCount: 1 });
    const detail = (await api('GET', `/questions/${q}`)).json();
    expect(detail.usage).toEqual({
      draftExams: [{ id: draft.id, title: 'Nháp' }],
      publishedCount: 1,
    });
  });
});

describe('Nhân bản, Lưu trữ và Khôi phục Bộ đề (Q177–Q179)', () => {
  it('Nhân bản thành nháp mới cùng Phần, thứ tự, điểm; tên thêm "(bản sao)"; nguồn không đổi', async () => {
    const [a, b] = [await question('A'), await question('B')];
    const exam = await draftExam([a, b], 'Giữa kỳ');
    await publish(exam);
    const res = await api('POST', `/exams/${exam.id}/duplicate`);
    expect(res.statusCode, res.body).toBe(201);
    const copy = (await api('GET', `/exams/${res.json().id}`)).json();
    expect(copy).toMatchObject({ status: 'draft', title: 'Giữa kỳ (bản sao)', version: 1 });
    expect(copy.sections[0].items.map((i: { questionId: string }) => i.questionId)).toEqual([a, b]);
    expect(copy.totals).toEqual({ items: 2, points: 2 });
    expect((await api('GET', `/exams/${exam.id}`)).json().status).toBe('published');
    expect(
      (await api('POST', `/exams/${exam.id}/duplicate`, undefined, otherCookie)).statusCode,
    ).toBe(404);
  });

  it('tên bản sao cắt ở 200 ký tự', async () => {
    const exam = await draftExam([await question('A')], 'x'.repeat(200));
    const res = await api('POST', `/exams/${exam.id}/duplicate`);
    const copy = (await api('GET', `/exams/${res.json().id}`)).json();
    expect(copy.title).toHaveLength(200);
  });

  it('Lưu trữ: published ↔ archived; nháp không Lưu trữ; danh sách mặc định ẩn Bộ đề đã Lưu trữ', async () => {
    const exam = await draftExam([await question('A')]);
    const early = await api('POST', `/exams/${exam.id}/archive`);
    expect(early.statusCode).toBe(409);
    expect(early.json().reason).toBe('EXAM_WRONG_STATUS');
    await publish(exam);
    expect((await api('POST', `/exams/${exam.id}/archive`)).statusCode).toBe(200);
    expect((await api('GET', '/exams')).json().total).toBe(0);
    expect((await api('GET', '/exams?status=archived')).json().total).toBe(1);
    expect((await api('GET', `/exams/${exam.id}/preview`)).statusCode).toBe(200);
    expect((await api('POST', `/exams/${exam.id}/archive`)).statusCode).toBe(409);
    expect((await api('POST', `/exams/${exam.id}/restore`)).statusCode).toBe(200);
    expect((await api('GET', `/exams/${exam.id}`)).json().status).toBe('published');
    expect((await api('POST', `/exams/${exam.id}/restore`)).statusCode).toBe(409);
  });
});

describe('ảnh của Bộ đề đã Phát hành (Q176)', () => {
  it('ảnh không xóa được và chủ Bộ đề xem được kể cả khi ảnh đã đổi chủ', async () => {
    const res = await upload(
      t.app,
      '/api/illustrations',
      { filename: 'h.jpg', content: await jpeg(400, 300) },
      { cookie },
    );
    const imageId = res.json().id as string;
    await t.queue.drain();
    const q = await question('A', imageQuestion(imageId));
    const exam = await draftExam([q]);
    await publish(exam);

    // Gỡ liên kết Câu hỏi để chỉ còn Bộ đề giữ ảnh (mô phỏng Câu hỏi đã chuyển đi hoặc bị xóa).
    await sql('delete from question_illustrations where illustration_id = $1', [imageId]);
    const listed = (await api('GET', '/illustrations')).json().items[0];
    expect(listed).toMatchObject({ id: imageId, inUse: true });
    const del = await api('DELETE', `/illustrations/${imageId}`);
    expect(del.statusCode).toBe(409);
    expect(del.json().reason).toBe('ILLUSTRATION_IN_USE');

    await sql(
      'update illustrations set owner_id = (select id from users where username = $1) where id = $2',
      ['gv2', imageId],
    );
    expect((await api('GET', `/media/${imageId}/480`)).statusCode).toBe(200); // chủ Bộ đề
    expect((await api('GET', `/media/${imageId}/480`, undefined, otherCookie)).statusCode).toBe(
      200,
    ); // chủ ảnh
    await seedUser({ username: 'gv3', roleTags: ['examiner'] });
    const third = (await login(t.app, 'gv3', DEFAULT_PASSWORD)).cookie as string;
    expect((await api('GET', `/media/${imageId}/480`, undefined, third)).statusCode).toBe(404);
  });
});
