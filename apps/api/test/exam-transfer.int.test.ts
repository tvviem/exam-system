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
let adminCookie: string;
let donorCookie: string;
let recipientCookie: string;
let donor: { id: string };
let recipient: { id: string };

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'qt', isAdmin: true, fullName: 'Quản Trị' });
  donor = await seedUser({ username: 'cu', roleTags: ['examiner'], fullName: 'Nguyễn Văn An' });
  recipient = await seedUser({
    username: 'moi',
    roleTags: ['examiner'],
    fullName: 'Trần Thị Bích',
  });
  adminCookie = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
  donorCookie = (await login(t.app, 'cu', DEFAULT_PASSWORD)).cookie as string;
  recipientCookie = (await login(t.app, 'moi', DEFAULT_PASSWORD)).cookie as string;
});

const api = (method: string, path: string, body?: unknown, who = donorCookie) =>
  call(t.app, method as 'GET', `/api${path}`, { cookie: who, body });

const topic = async (name: string) => (await api('POST', '/topics', { name })).json().id as string;
async function question(topicId: string, stem: string, input?: QuestionInput) {
  const res = await api('POST', '/questions', input ?? singleChoice(topicId, { stem }));
  expect(res.statusCode, res.body).toBe(201);
  return res.json().id as string;
}

/** Bộ đề nháp của người cho với các câu (mỗi câu 1 điểm), một Phần. */
async function exam(questionIds: string[], title: string) {
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
  return saved.json() as { id: string; version: number };
}
const publish = async (e: { id: string; version: number }) => {
  const res = await api('POST', `/exams/${e.id}/publish`, { version: e.version });
  expect(res.statusCode, res.body).toBe(200);
};
const ownerOf = async (examId: string) =>
  (await sql<{ owner_id: string }>('select owner_id from exams where id = $1', [examId]))[0]
    ?.owner_id;
const itemCount = async (examId: string) =>
  Number(
    (await sql<{ n: string }>('select count(*) n from exam_items where exam_id = $1', [examId]))[0]
      ?.n,
  );

const content = (query = '') =>
  call(t.app, 'GET', `/api/admin/users/${donor.id}/content${query}`, { cookie: adminCookie });
const transfer = (topicIds: string[]) =>
  call(t.app, 'POST', `/api/admin/users/${donor.id}/transfer`, {
    cookie: adminCookie,
    body: { topicIds, recipientId: recipient.id },
  });
const removeDonor = (query: string) =>
  call(t.app, 'DELETE', `/api/admin/users/${donor.id}${query}`, { cookie: adminCookie });

describe('Chuyển giao Chủ đề mang theo Bộ đề nháp (Q182)', () => {
  it('nháp trộn: chuyển cả Bộ đề, gỡ câu ở lại; nháp thuần chuyển nguyên; nháp không liên quan ở lại', async () => {
    const moving = await topic('Chuyển');
    const staying = await topic('Ở lại');
    const [m1, m2] = [await question(moving, 'M1'), await question(moving, 'M2')];
    const s1 = await question(staying, 'S1');
    const mixed = await exam([m1, s1, m2], 'Trộn');
    const pure = await exam([m1], 'Thuần');
    const unrelated = await exam([s1], 'Không liên quan');

    const summary = (await content(`?topicIds=${moving}`)).json();
    expect(summary.selected).toMatchObject({ exams: 2, detachedItems: 1 });
    expect(summary.totals).toMatchObject({ exams: 3 });

    const res = await transfer([moving]);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ topics: 1, questions: 2, exams: 2, detachedItems: 1 });

    expect(await ownerOf(mixed.id)).toBe(recipient.id);
    expect(await ownerOf(pure.id)).toBe(recipient.id);
    expect(await ownerOf(unrelated.id)).toBe(donor.id);
    expect(await itemCount(mixed.id)).toBe(2); // S1 bị gỡ
    expect(await itemCount(pure.id)).toBe(1);
    expect(await itemCount(unrelated.id)).toBe(1);

    // Người nhận mở được và sửa được Bộ đề vừa nhận; người cho không còn thấy.
    const got = await api('GET', `/exams/${mixed.id}`, undefined, recipientCookie);
    expect(got.statusCode).toBe(200);
    expect(got.json().version).toBe(mixed.version + 1);
    expect((await api('GET', `/exams/${mixed.id}`)).statusCode).toBe(404);
  });

  it('Bộ đề đã Phát hành ở lại người cho dù câu của nó được chuyển; bản chụp và Xem thử không đổi', async () => {
    const moving = await topic('Chuyển');
    const q = await question(moving, 'Giữ nguyên');
    const published = await exam([q], 'Đã xong');
    await publish(published);

    const res = await transfer([moving]);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ exams: 0, detachedItems: 0 });
    expect(await ownerOf(published.id)).toBe(donor.id);
    const preview = await api('GET', `/exams/${published.id}/preview`);
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toContain('Giữ nguyên');
    // Câu đã sang người nhận nhưng Bộ đề của người cho vẫn tham chiếu được.
    const [row] = await sql<{ owner_id: string }>('select owner_id from questions where id = $1', [
      q,
    ]);
    expect(row?.owner_id).toBe(recipient.id);
  });

  it('ảnh còn nằm trong Bộ đề đã Phát hành ở lại người cho: sao chép cho người nhận, bản gốc ở lại', async () => {
    const moving = await topic('Chuyển');
    const up = await upload(
      t.app,
      '/api/illustrations',
      { filename: 'h.jpg', content: await jpeg(400, 300) },
      { cookie: donorCookie },
    );
    const imageId = up.json().id as string;
    await t.queue.drain();
    const withImage: QuestionInput = {
      ...singleChoice(moving),
      stem: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Xem hình' }] },
          { type: 'image', attrs: { illustrationId: imageId, alt: 'Hình' } },
        ],
      } as RichText,
    };
    const q = await question(moving, 'x', withImage);
    await publish(await exam([q], 'Có ảnh'));

    expect((await transfer([moving])).statusCode).toBe(200);
    const [orig] = await sql<{ owner_id: string }>(
      'select owner_id from illustrations where id = $1',
      [imageId],
    );
    expect(orig?.owner_id).toBe(donor.id); // không đổi chủ
    const [copy] = await sql<{ n: string }>(
      'select count(*) n from illustrations where owner_id = $1',
      [recipient.id],
    );
    expect(Number(copy?.n)).toBe(1);
    // Người cho vẫn xem được ảnh qua Bộ đề đã Phát hành của mình.
    expect((await api('GET', `/media/${imageId}/480`)).statusCode).toBe(200);
  });

  it('giao dịch lỗi thì không đổi gì: Bộ đề vẫn ở người cho', async () => {
    const moving = await topic('Chuyển');
    const q = await question(moving, 'A');
    const e = await exam([q], 'Nháp');
    const res = await call(t.app, 'POST', `/api/admin/users/${donor.id}/transfer`, {
      cookie: adminCookie,
      body: { topicIds: [moving], recipientId: donor.id }, // người nhận không hợp lệ
    });
    expect(res.statusCode).toBe(400);
    expect(await ownerOf(e.id)).toBe(donor.id);
    expect(await itemCount(e.id)).toBe(1);
  });

  it('thông báo cho người nhận nêu cả số Bộ đề', async () => {
    const moving = await topic('Chuyển');
    await exam([await question(moving, 'A')], 'Nháp');
    await transfer([moving]);
    const bell = (await api('GET', '/notifications', undefined, recipientCookie)).json();
    expect(bell.items[0]).toMatchObject({
      type: 'topics.transferred',
      data: { topics: 1, exams: 1 },
    });
  });
});

describe('Xóa người dùng mang theo mọi Bộ đề (Q183)', () => {
  it('nháp, đã Phát hành và Lưu trữ đều sang người nhận; người cho bị Xóa', async () => {
    const tp = await topic('Giải tích');
    const q1 = await question(tp, 'Q1');
    const q2 = await question(tp, 'Q2');
    const draft = await exam([q1], 'Nháp');
    const published = await exam([q1, q2], 'Đã xong');
    await publish(published);
    const archived = await exam([q2], 'Cũ');
    await publish(archived);
    await api('POST', `/exams/${archived.id}/archive`);

    const res = await removeDonor(`?recipientId=${recipient.id}`);
    expect(res.statusCode, res.body).toBe(200);
    for (const e of [draft, published, archived]) expect(await ownerOf(e.id)).toBe(recipient.id);
    const mine = (await api('GET', '/exams?status=published', undefined, recipientCookie)).json();
    expect(mine.total).toBe(1);
    expect(
      (await api('GET', `/exams/${published.id}/preview`, undefined, recipientCookie)).statusCode,
    ).toBe(200);
  });

  it('chỉ có Bộ đề rỗng, chưa có Chủ đề: vẫn HAS_CONTENT cho tới khi nêu người nhận', async () => {
    const e = await exam([], 'Rỗng');
    const blocked = await removeDonor('');
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: 'HAS_CONTENT', exams: 1 });
    expect((await removeDonor(`?recipientId=${recipient.id}`)).statusCode).toBe(200);
    expect(await ownerOf(e.id)).toBe(recipient.id);
  });
});
