import { textDoc } from '@exam/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamUsageService } from '../src/modules/exam/exam-usage.service';
import { ExamsService } from '../src/modules/exam/exams.service';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let cookie: string;
let otherCookie: string;
let adminCookie: string;
let candidateCookie: string;
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
  await seedUser({ username: 'qt', isAdmin: true });
  await seedUser({ username: 'sv', roleTags: ['candidate'] });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  adminCookie = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
  candidateCookie = (await login(t.app, 'sv', DEFAULT_PASSWORD)).cookie as string;
  topicId = (
    await call(t.app, 'POST', '/api/topics', { cookie, body: { name: 'Giải tích' } })
  ).json().id;
});

const create = (title = 'Giữa kỳ', who = cookie) =>
  call(t.app, 'POST', '/api/exams', { cookie: who, body: { title } });
const detail = (id: string, who = cookie) =>
  call(t.app, 'GET', `/api/exams/${id}`, { cookie: who });
const list = (query = '', who = cookie) =>
  call(t.app, 'GET', `/api/exams${query}`, { cookie: who });
const put = (id: string, body: unknown, who = cookie) =>
  call(t.app, 'PUT', `/api/exams/${id}`, { cookie: who, body });
const remove = (id: string, who = cookie) =>
  call(t.app, 'DELETE', `/api/exams/${id}`, { cookie: who });

async function question(stem = 'Câu hỏi', who = cookie, topic = topicId, points = 1) {
  const res = await call(t.app, 'POST', '/api/questions', {
    cookie: who,
    body: singleChoice(topic, { stem, defaultPoints: points }),
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json().id as string;
}

interface Layout {
  title?: string;
  instructions?: unknown;
  version: number;
  sections: {
    id?: string;
    title?: string | null;
    instructions?: unknown;
    items: { questionId: string; points: number }[];
  }[];
}

/** Nội dung gửi lên với giá trị mặc định cho các trường không nêu. */
const doc = ({ title = 'Giữa kỳ', instructions, version, sections }: Layout) => ({
  title,
  instructions: instructions ?? textDoc(''),
  version,
  sections: sections.map((s) => ({
    ...(s.id ? { id: s.id } : {}),
    title: s.title ?? null,
    instructions: s.instructions ?? textDoc(''),
    items: s.items,
  })),
});

const item = (questionId: string, points = 1) => ({ questionId, points });

describe('tạo và xem Bộ đề (Q160, Q161, Q181)', () => {
  it('tạo Bộ đề nháp với đúng một Phần mặc định không tiêu đề', async () => {
    const res = await create('  Giữa   kỳ  ');
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({
      title: 'Giữa kỳ',
      status: 'draft',
      version: 1,
      publishedAt: null,
      sections: [{ title: null, items: [] }],
      totals: { items: 0, points: 0 },
    });
  });

  it('tiêu đề rỗng hoặc quá 200 ký tự là VALIDATION_FAILED', async () => {
    expect((await create('   ')).statusCode).toBe(400);
    expect((await create('x'.repeat(201))).statusCode).toBe(400);
  });

  it('chỉ Người ra đề: Người dự thi và Quản trị viên 403, chưa đăng nhập 401', async () => {
    expect((await create('A', candidateCookie)).statusCode).toBe(403);
    expect((await create('A', adminCookie)).statusCode).toBe(403);
    expect((await list('', adminCookie)).statusCode).toBe(403);
    expect((await call(t.app, 'GET', '/api/exams')).statusCode).toBe(401);
  });

  it('Bộ đề của người khác là NOT_FOUND, kể cả sửa và xóa', async () => {
    const { id } = (await create()).json();
    expect((await detail(id, otherCookie)).statusCode).toBe(404);
    const body = doc({ version: 1, sections: [{ items: [] }] });
    expect((await put(id, body, otherCookie)).statusCode).toBe(404);
    expect((await remove(id, otherCookie)).statusCode).toBe(404);
    expect((await detail(id)).statusCode).toBe(200);
  });
});

describe('lưu cả tài liệu (Q162, Q163)', () => {
  it('lưu Phần, thứ tự câu và điểm; version tăng; chi tiết trả kèm thông tin câu hỏi', async () => {
    const { id } = (await create()).json();
    const q1 = await question('Câu một', cookie, topicId, 1);
    const q2 = await question('Câu hai', cookie, topicId, 2);
    const q3 = await question('Câu ba');
    const res = await put(
      id,
      doc({
        title: 'Cuối kỳ',
        instructions: textDoc('Làm bài 45 phút.'),
        version: 1,
        sections: [
          { title: 'Phần I', items: [item(q2, 0.5), item(q1, 2.25)] },
          { title: null, items: [item(q3, 1)] },
        ],
      }),
    );
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      title: 'Cuối kỳ',
      version: 2,
      totals: { items: 3, points: 3.75 },
    });
    expect(body.sections.map((s: { title: string | null }) => s.title)).toEqual(['Phần I', null]);
    expect(body.sections[0].items).toMatchObject([
      {
        questionId: q2,
        points: 0.5,
        question: {
          type: 'single_choice',
          preview: 'Câu hai',
          topicName: 'Giải tích',
          defaultPoints: 2,
          tags: [],
          archived: false,
        },
      },
      { questionId: q1, points: 2.25 },
    ]);
    expect((await detail(id)).json()).toEqual(body);
  });

  it('lưu lần nữa giữ id của Phần đã có, bỏ Phần vắng mặt cùng các câu của nó, sắp lại thứ tự', async () => {
    const { id } = (await create()).json();
    const [a, b, c] = [await question('A'), await question('B'), await question('C')];
    const first = (
      await put(
        id,
        doc({
          version: 1,
          sections: [{ items: [item(a)] }, { items: [item(b), item(c)] }],
        }),
      )
    ).json();
    const [s1, s2] = first.sections as { id: string }[];
    const second = await put(
      id,
      doc({
        version: 2,
        sections: [{ id: s2?.id, items: [item(c), item(b)] }, { items: [item(a)] }],
      }),
    );
    expect(second.statusCode, second.body).toBe(200);
    const sections = second.json().sections as { id: string; items: { questionId: string }[] }[];
    expect(sections[0]?.id).toBe(s2?.id);
    expect(sections[0]?.items.map((i) => i.questionId)).toEqual([c, b]);
    expect(sections[1]?.id).not.toBe(s1?.id); // Phần cũ không nêu id: coi là Phần mới
    const [{ n } = { n: '0' }] = await sql<{ n: string }>(
      'SELECT count(*)::text AS n FROM exam_sections WHERE exam_id = $1',
      [id],
    );
    expect(Number(n)).toBe(2);
  });

  it('version cũ: CONFLICT và không đổi gì', async () => {
    const { id } = (await create()).json();
    const q = await question();
    await put(id, doc({ version: 1, sections: [{ items: [item(q)] }] }));
    const stale = await put(id, doc({ title: 'Ghi đè', version: 1, sections: [{ items: [] }] }));
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'CONFLICT', field: 'version' });
    const now = (await detail(id)).json();
    expect(now.title).toBe('Giữa kỳ');
    expect(now.totals.items).toBe(1);
  });

  it('câu trùng trong Bộ đề, câu của người khác hoặc không có, id Phần lạ: VALIDATION_FAILED', async () => {
    const { id } = (await create()).json();
    const mine = await question();
    const theirs = await question(
      'Của người khác',
      otherCookie,
      (
        await call(t.app, 'POST', '/api/topics', { cookie: otherCookie, body: { name: 'T' } })
      ).json().id,
    );
    const issues = async (body: unknown) => (await put(id, body)).json().issues;

    expect(
      await issues(
        doc({ version: 1, sections: [{ items: [item(mine)] }, { items: [item(mine)] }] }),
      ),
    ).toEqual([{ path: 'sections.1.items.0.questionId', code: 'duplicate_question' }]);
    expect(await issues(doc({ version: 1, sections: [{ items: [item(theirs)] }] }))).toEqual([
      { path: 'sections.0.items.0.questionId', code: 'unknown_question' },
    ]);
    expect(
      await issues(
        doc({
          version: 1,
          sections: [{ items: [item('0198a000-0000-7000-8000-000000000000')] }],
        }),
      ),
    ).toEqual([{ path: 'sections.0.items.0.questionId', code: 'unknown_question' }]);
    expect(
      await issues(
        doc({
          version: 1,
          sections: [{ id: '0198a000-0000-7000-8000-000000000000', items: [] }],
        }),
      ),
    ).toEqual([{ path: 'sections.0.id', code: 'unknown_section' }]);
  });

  it('quá 200 câu hoặc quá 20 Phần, điểm sai, hướng dẫn có ảnh: VALIDATION_FAILED', async () => {
    const { id } = (await create()).json();
    const q = await question();
    const sections = Array.from({ length: 21 }, () => ({ items: [] }));
    expect((await put(id, doc({ version: 1, sections }))).statusCode).toBe(400);
    expect(
      (await put(id, doc({ version: 1, sections: [{ items: [item(q, 0.07)] }] }))).statusCode,
    ).toBe(400);
    const image = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { illustrationId: '0198a000-0000-7000-8000-0000000000aa', alt: 'hình' },
        },
      ],
    };
    expect(
      (await put(id, doc({ version: 1, instructions: image, sections: [{ items: [] }] })))
        .statusCode,
    ).toBe(400);
  });

  it('một lỗi ở Phần sau thì cả lần lưu không đổi gì (nguyên tử)', async () => {
    const { id } = (await create()).json();
    const good = await question();
    const res = await put(
      id,
      doc({
        title: 'Đổi tên',
        version: 1,
        sections: [
          { items: [item(good)] },
          { items: [item('0198a000-0000-7000-8000-000000000000')] },
        ],
      }),
    );
    expect(res.statusCode).toBe(400);
    const now = (await detail(id)).json();
    expect(now).toMatchObject({ title: 'Giữa kỳ', version: 1, totals: { items: 0 } });
  });

  it('câu đã Lưu trữ: không thêm mới được, nhưng câu đã có trong Bộ đề vẫn giữ được khi lưu lại', async () => {
    const { id } = (await create()).json();
    const kept = await question('Giữ');
    const archivedNew = await question('Lưu trữ mới');
    await put(id, doc({ version: 1, sections: [{ items: [item(kept)] }] }));
    await sql('UPDATE questions SET archived_at = now() WHERE id = ANY($1::uuid[])', [
      [kept, archivedNew],
    ]);

    const resave = await put(id, doc({ version: 2, sections: [{ items: [item(kept)] }] }));
    expect(resave.statusCode, resave.body).toBe(200);
    expect(resave.json().sections[0].items[0].question.archived).toBe(true);

    const adding = await put(
      id,
      doc({ version: 3, sections: [{ items: [item(kept), item(archivedNew)] }] }),
    );
    expect(adding.json().issues).toEqual([
      { path: 'sections.0.items.1.questionId', code: 'question_archived' },
    ]);
  });

  it('chỉ Bộ đề nháp sửa và xóa được', async () => {
    const { id } = (await create()).json();
    await sql("UPDATE exams SET status = 'published', published_at = now() WHERE id = $1", [id]);
    const body = doc({ version: 1, sections: [{ items: [] }] });
    for (const res of [await put(id, body), await remove(id)]) {
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'EXAM_NOT_DRAFT' });
    }
    expect((await detail(id)).statusCode).toBe(200);
  });
});

describe('va chạm đồng thời và id Phần trùng', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hai Phần cùng một id trong một lần lưu: VALIDATION_FAILED, không đổi gì', async () => {
    const { id } = (await create()).json();
    const saved = (await put(id, doc({ version: 1, sections: [{ items: [] }] }))).json();
    const sectionId = saved.sections[0].id;
    const res = await put(
      id,
      doc({
        version: 2,
        sections: [
          { id: sectionId, items: [] },
          { id: sectionId, items: [] },
        ],
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([{ path: 'sections.1.id', code: 'duplicate_section' }]);
    expect((await detail(id)).json().version).toBe(2);
  });

  it('câu bị xóa đúng giữa lúc kiểm tra và lúc lưu: báo câu không còn, không phải lỗi 500', async () => {
    const { id } = (await create()).json();
    const gone = await question('Sắp xóa');
    // Bỏ qua phép kiểm tham chiếu để mô phỏng câu bị xóa sau lúc kiểm tra.
    const service = t.app.get(ExamsService) as unknown as {
      referenceProblems: () => Promise<unknown[]>;
    };
    vi.spyOn(service, 'referenceProblems').mockResolvedValue([]);
    await call(t.app, 'POST', '/api/questions/delete', { cookie, body: { ids: [gone] } });
    const res = await put(id, doc({ version: 1, sections: [{ items: [item(gone)] }] }));
    expect(res.statusCode, res.body).toBe(400);
    expect(res.json().issues).toEqual([{ path: 'sections', code: 'unknown_question' }]);
  });

  it('câu được thêm vào Bộ đề nháp đúng giữa lúc kiểm tra và lúc xóa: vẫn QUESTION_IN_EXAM', async () => {
    const { id } = (await create()).json();
    const used = await question('Đang dùng');
    await put(id, doc({ version: 1, sections: [{ items: [item(used)] }] }));
    vi.spyOn(t.app.get(ExamUsageService), 'draftExamsOf').mockResolvedValue(new Map());
    const res = await call(t.app, 'POST', '/api/questions/delete', {
      cookie,
      body: { ids: [used] },
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'QUESTION_IN_EXAM' });
  });
});

describe('danh sách (Q180)', () => {
  it('mặc định hiện Nháp và Đã phát hành; lọc theo trạng thái; chỉ của mình; kèm số câu và tổng điểm', async () => {
    const draft = (await create('Nháp một')).json().id;
    const published = (await create('Đã xong')).json().id;
    const archived = (await create('Cũ')).json().id;
    await create('Của người khác', otherCookie);
    await sql("UPDATE exams SET status = 'published' WHERE id = $1", [published]);
    await sql("UPDATE exams SET status = 'archived' WHERE id = $1", [archived]);
    const q = await question();
    await put(draft, doc({ title: 'Nháp một', version: 1, sections: [{ items: [item(q, 2.5)] }] }));

    const titles = async (query = '') =>
      ((await list(query)).json().items as { title: string }[]).map((e) => e.title).sort();
    expect(await titles()).toEqual(['Nháp một', 'Đã xong']);
    expect(await titles('?status=archived')).toEqual(['Cũ']);
    expect(await titles('?status=draft')).toEqual(['Nháp một']);
    expect(await titles('?status=published')).toEqual(['Đã xong']);

    const row = (await list('?status=draft')).json().items[0];
    expect(row).toMatchObject({ id: draft, status: 'draft', itemCount: 1, totalPoints: 2.5 });
  });

  it('tìm theo tên không dấu, không phân biệt hoa thường; phân trang', async () => {
    await create('Kiểm tra Giải tích');
    await create('Đại số tuyến tính');
    const found = (await list('?q=giai%20tich')).json();
    expect(found.items.map((e: { title: string }) => e.title)).toEqual(['Kiểm tra Giải tích']);
    for (let i = 0; i < 3; i++) await create(`Đề ${i}`);
    const page = (await list('?page=2&pageSize=2')).json();
    expect(page).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(2);
  });
});

describe('xóa Bộ đề nháp', () => {
  it('xóa hẳn Bộ đề, Phần và các dòng; Câu hỏi còn nguyên', async () => {
    const { id } = (await create()).json();
    const q = await question();
    await put(id, doc({ version: 1, sections: [{ items: [item(q)] }] }));
    expect((await remove(id)).statusCode).toBe(200);
    expect((await detail(id)).statusCode).toBe(404);
    const [{ n } = { n: '1' }] = await sql<{ n: string }>(
      'SELECT count(*)::text AS n FROM exam_items WHERE exam_id = $1',
      [id],
    );
    expect(Number(n)).toBe(0);
    expect((await call(t.app, 'GET', `/api/questions/${q}`, { cookie })).statusCode).toBe(200);
  });
});

describe('xóa Câu hỏi đang ở Bộ đề nháp (Q166)', () => {
  const deleteQuestions = (ids: string[]) =>
    call(t.app, 'POST', '/api/questions/delete', { cookie, body: { ids } });

  it('bị chặn, nêu tên Bộ đề; gỡ khỏi Bộ đề rồi xóa được', async () => {
    const { id } = (await create('Giữa kỳ')).json();
    const used = await question('Đang dùng');
    await put(id, doc({ version: 1, sections: [{ items: [item(used)] }] }));

    const blocked = await deleteQuestions([used]);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      code: 'INVALID_STATE',
      reason: 'QUESTION_IN_EXAM',
      exams: [{ id, title: 'Giữa kỳ' }],
    });
    expect((await call(t.app, 'GET', `/api/questions/${used}`, { cookie })).statusCode).toBe(200);

    await put(id, doc({ version: 2, sections: [{ items: [] }] }));
    expect((await deleteQuestions([used])).statusCode).toBe(200);
  });

  it('xóa nhiều câu mà một câu vướng thì cả lô không xóa gì', async () => {
    const { id } = (await create()).json();
    const free = await question('Tự do');
    const used = await question('Vướng');
    await put(id, doc({ version: 1, sections: [{ items: [item(used)] }] }));
    expect((await deleteQuestions([free, used])).statusCode).toBe(409);
    expect((await call(t.app, 'GET', `/api/questions/${free}`, { cookie })).statusCode).toBe(200);
  });
});
