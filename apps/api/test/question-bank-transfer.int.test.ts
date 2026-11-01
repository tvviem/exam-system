import type { QuestionInput, RichText } from '@exam/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_STORE, type MediaStore } from '../src/media/media-store';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login, upload } from './support/http';
import { jpeg } from './support/images';
import { singleChoice } from './support/question-bank';
import { importRow, importWorkbook } from './support/question-import-files';
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
afterEach(() => {
  vi.restoreAllMocks();
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

const media = () => t.app.get<MediaStore>(MEDIA_STORE);

const topic = async (name: string, who = donorCookie) =>
  (await call(t.app, 'POST', '/api/topics', { cookie: who, body: { name } })).json().id as string;
const archive = (id: string, who = donorCookie) =>
  call(t.app, 'POST', `/api/topics/${id}/archive`, { cookie: who });
const question = async (input: QuestionInput, who = donorCookie) => {
  const res = await call(t.app, 'POST', '/api/questions', { cookie: who, body: input });
  expect(res.statusCode, res.body).toBe(201);
  return res.json().id as string;
};
const getQuestion = async (id: string, who: string) =>
  (await call(t.app, 'GET', `/api/questions/${id}`, { cookie: who })).json();

async function uploadImage(content: Buffer, who = donorCookie) {
  const res = await upload(
    t.app,
    '/api/illustrations',
    { filename: 'hinh.jpg', content },
    { cookie: who },
  );
  expect(res.statusCode, res.body).toBe(201);
  await t.queue.drain();
  return res.json().id as string;
}

const withImage = (topicId: string, illustrationId: string): QuestionInput => ({
  ...singleChoice(topicId),
  stem: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Xem hình' }] },
      { type: 'image', attrs: { illustrationId, alt: 'Tam giác ABC' } },
    ],
  } as RichText,
});

const imageIdOf = (question: { stem: RichText }) =>
  (question.stem.content.find((b) => b.type === 'image') as { attrs: { illustrationId: string } })
    .attrs.illustrationId;

const content = (userId: string, query = '', who = adminCookie) =>
  call(t.app, 'GET', `/api/admin/users/${userId}/content${query}`, { cookie: who });
const transfer = (userId: string, body: unknown, who = adminCookie) =>
  call(t.app, 'POST', `/api/admin/users/${userId}/transfer`, { cookie: who, body });
const removeUser = (userId: string, query = '', who = adminCookie) =>
  call(t.app, 'DELETE', `/api/admin/users/${userId}${query}`, { cookie: who });
const topicsOf = async (who: string) =>
  (await call(t.app, 'GET', '/api/topics?includeArchived=true', { cookie: who })).json() as {
    id: string;
    name: string;
  }[];
const bell = async (who: string) =>
  (await call(t.app, 'GET', '/api/notifications', { cookie: who })).json();
const audit = (action: string) =>
  sql<{ entity_id: string; after: Record<string, unknown> }>(
    'SELECT entity_id, after FROM audit_logs WHERE action = $1',
    [action],
  );
const ownerOfTopic = async (id: string) =>
  (await sql<{ owner_id: string }>('SELECT owner_id FROM topics WHERE id = $1', [id]))[0]?.owner_id;

describe('xem nội dung của người dùng (Q148)', () => {
  it('liệt kê Chủ đề kèm số Câu hỏi, số ảnh và trạng thái Lưu trữ; không trả nội dung câu hỏi', async () => {
    const a = await topic('Giải tích');
    const b = await topic('Đại số');
    await question(singleChoice(a));
    await question(singleChoice(a, { stem: 'Câu hai' }));
    await question(withImage(b, await uploadImage(await jpeg(600, 400, 1))));
    await archive(b);

    const res = await content(donor.id);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({
      topics: [
        { id: b, name: 'Đại số', archived: true, questionCount: 1, illustrationCount: 1 },
        { id: a, name: 'Giải tích', archived: false, questionCount: 2, illustrationCount: 0 },
      ],
      totals: { topics: 2, questions: 3, illustrations: 1, exams: 0, detachedItems: 0 },
    });
    expect(res.body).not.toContain('Đạo hàm');
  });

  it('tóm tắt đúng cho các Chủ đề được chọn; ảnh dùng ở nhiều câu chỉ đếm một lần', async () => {
    const a = await topic('A');
    const b = await topic('B');
    const x = await uploadImage(await jpeg(600, 400, 1));
    await question(withImage(a, x));
    await question(withImage(b, x));
    const res = await content(donor.id, `?topicIds=${a},${b}`);
    expect(res.json().selected).toEqual({
      topics: 2,
      questions: 2,
      illustrations: 1,
      exams: 0,
      detachedItems: 0,
    });
    expect((await content(donor.id, `?topicIds=${a}`)).json().selected).toEqual({
      topics: 1,
      questions: 1,
      illustrations: 1,
      exams: 0,
      detachedItems: 0,
    });
  });

  it('xem được cả người dùng đã bị Xóa; người không tồn tại là 404; không phải Quản trị viên là 403', async () => {
    const gone = await seedUser({ removed: true, roleTags: ['examiner'] });
    expect((await content(gone.id)).statusCode).toBe(200);
    expect((await content('0198a000-0000-7000-8000-000000000000')).statusCode).toBe(404);
    expect((await content(donor.id, '', donorCookie)).statusCode).toBe(403);
  });
});

describe('Chuyển giao Chủ đề (Q148)', () => {
  it('đổi chủ Chủ đề và Câu hỏi, giữ nguyên version; ghi nhật ký và thông báo cho người nhận', async () => {
    const a = await topic('Giải tích');
    const q = await question(singleChoice(a));
    const res = await transfer(donor.id, { topicIds: [a], recipientId: recipient.id });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({
      topics: 1,
      questions: 1,
      illustrations: 0,
      exams: 0,
      detachedItems: 0,
    });

    expect(await ownerOfTopic(a)).toBe(recipient.id);
    expect((await topicsOf(donorCookie)).map((x) => x.id)).toEqual([]);
    expect((await topicsOf(recipientCookie)).map((x) => x.id)).toEqual([a]);
    expect((await getQuestion(q, donorCookie)).code).toBe('NOT_FOUND');
    expect(await getQuestion(q, recipientCookie)).toMatchObject({ id: q, version: 1 });

    const [log] = await audit('topic.transfer');
    expect(log?.entity_id).toBe(donor.id);
    expect(log?.after).toMatchObject({
      from: donor.id,
      to: recipient.id,
      topics: 1,
      questions: 1,
      illustrations: 0,
    });
    const received = (await bell(recipientCookie)).items;
    expect(received).toMatchObject([{ type: 'topics.transferred', data: { topics: 1 } }]);
    expect((await bell(donorCookie)).items).toEqual([]);
  });

  it('chuyển được cả Chủ đề đã Lưu trữ (giữ nguyên tên và trạng thái)', async () => {
    const a = await topic('Cũ');
    await question(singleChoice(a));
    await archive(a);
    await transfer(donor.id, { topicIds: [a], recipientId: recipient.id });
    const moved = (await topicsOf(recipientCookie)).find((x) => x.id === a);
    expect(moved).toMatchObject({ name: 'Cũ' });
    const [row] = await sql<{ archived_at: Date | null }>(
      'SELECT archived_at FROM topics WHERE id = $1',
      [a],
    );
    expect(row?.archived_at).not.toBeNull();
  });

  it('tên trùng Chủ đề chưa Lưu trữ của người nhận thì thêm " (từ <tên>)", rồi đánh số', async () => {
    await topic('Giải tích', recipientCookie);
    await topic('Giải tích (từ Nguyễn Văn An)', recipientCookie);
    const a = await topic('Giải tích');
    const b = await topic('Đại số');
    await topic('Đại số', recipientCookie); // trùng thứ hai, độc lập với Chủ đề đầu
    await transfer(donor.id, { topicIds: [a, b], recipientId: recipient.id });
    const names = (await topicsOf(recipientCookie)).map((x) => x.name).sort();
    expect(names).toEqual(
      [
        'Giải tích',
        'Giải tích (từ Nguyễn Văn An)',
        'Giải tích (từ Nguyễn Văn An) (2)',
        'Đại số',
        'Đại số (từ Nguyễn Văn An)',
      ].sort(),
    );
  });

  it('tên trùng Chủ đề đã Lưu trữ của người nhận thì không cần đổi tên', async () => {
    const old = await topic('Hình học', recipientCookie);
    await archive(old, recipientCookie);
    const a = await topic('Hình học');
    await transfer(donor.id, { topicIds: [a], recipientId: recipient.id });
    const names = (await topicsOf(recipientCookie)).map((x) => x.name);
    expect(names.filter((n) => n === 'Hình học')).toHaveLength(2);
  });

  it('người nhận không hợp lệ: chính người cho, Quản trị viên, bị Khóa, đã Xóa, không có nhãn Người ra đề, không có thật', async () => {
    const a = await topic('A');
    const admin2 = await seedUser({ isAdmin: true });
    const locked = await seedUser({ roleTags: ['examiner'], status: 'locked' });
    const removed = await seedUser({ roleTags: ['examiner'], removed: true });
    const candidate = await seedUser({ roleTags: ['candidate'] });
    for (const id of [
      donor.id,
      admin2.id,
      locked.id,
      removed.id,
      candidate.id,
      '0198a000-0000-7000-8000-000000000000',
    ]) {
      const res = await transfer(donor.id, { topicIds: [a], recipientId: id });
      expect(res.statusCode, id).toBe(400);
      expect(res.json()).toMatchObject({
        code: 'VALIDATION_FAILED',
        issues: [{ path: 'recipientId', code: 'invalid_recipient' }],
      });
    }
    expect(await ownerOfTopic(a)).toBe(donor.id);
  });

  it('danh sách Chủ đề không hợp lệ: rỗng, trùng id, của người khác', async () => {
    const mine = await topic('A');
    const theirs = await topic('B', recipientCookie);
    const bad = async (topicIds: unknown) =>
      (await transfer(donor.id, { topicIds, recipientId: recipient.id })).json();
    expect(await bad([])).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await bad([theirs])).toMatchObject({
      issues: [{ path: 'topicIds', code: 'unknown_topic' }],
    });
    expect(await bad([mine, theirs])).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await ownerOfTopic(mine)).toBe(donor.id);
    expect(await ownerOfTopic(theirs)).toBe(recipient.id);
  });

  it('chuyển từ người đã bị Xóa được (Chủ đề còn sót lại dưới tài khoản đã Xóa)', async () => {
    const gone = await seedUser({ removed: true, roleTags: ['examiner'] });
    const [row] = await sql<{ id: string }>(
      "INSERT INTO topics (id, owner_id, name, name_key, created_at, updated_at) VALUES (gen_random_uuid(), $1, 'Sót', 'sot', now(), now()) RETURNING id",
      [gone.id],
    );
    const res = await transfer(gone.id, { topicIds: [row?.id], recipientId: recipient.id });
    expect(res.statusCode, res.body).toBe(200);
    expect(await ownerOfTopic(row?.id as string)).toBe(recipient.id);
  });

  it('chỉ Quản trị viên được chuyển giao', async () => {
    const a = await topic('A');
    const res = await transfer(donor.id, { topicIds: [a], recipientId: recipient.id }, donorCookie);
    expect(res.statusCode).toBe(403);
  });

  it('Lô nhập của Chủ đề được chuyển bị xóa (lô chỉ có ý nghĩa với chủ cũ)', async () => {
    const a = await topic('A');
    const file = {
      filename: 'cau-hoi.xlsx',
      content: await importWorkbook([importRow('Câu', ['a', 'b'], 'A')]),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    const ready = await upload(t.app, '/api/question-imports', file, {
      cookie: donorCookie,
      fields: { topicId: a },
    });
    await t.queue.drain();
    const parsing = await upload(t.app, '/api/question-imports', file, {
      cookie: donorCookie,
      fields: { topicId: a },
    });
    t.queue.discard(); // lô thứ hai kẹt ở "đang đọc"
    const parsingKey = `uploads/question-imports/${parsing.json().id}`;
    expect((await media().get(parsingKey)).length).toBeGreaterThan(0);

    await transfer(donor.id, { topicIds: [a], recipientId: recipient.id });
    const [{ n } = { n: '1' }] = await sql<{ n: string }>(
      'SELECT count(*)::text AS n FROM question_import_batches',
    );
    expect(Number(n)).toBe(0);
    expect(
      (
        await call(t.app, 'GET', `/api/question-imports/${ready.json().id}`, {
          cookie: donorCookie,
        })
      ).statusCode,
    ).toBe(404);
    await expect(media().get(parsingKey)).rejects.toThrow(); // file tạm cũng được dọn
  });
});

describe('Hình minh họa khi Chuyển giao (Q149)', () => {
  const illustrationsOf = async (who: string) =>
    (await call(t.app, 'GET', '/api/illustrations', { cookie: who })).json().items as {
      id: string;
      status: string;
      variants: number[];
    }[];
  const usageOf = async (questionId: string) =>
    (
      await sql<{ illustration_id: string }>(
        'SELECT illustration_id FROM question_illustrations WHERE question_id = $1',
        [questionId],
      )
    ).map((r) => r.illustration_id);

  it('ca 1: chỉ các câu được chuyển dùng ảnh, người nhận chưa có: đổi chủ ảnh, nội dung và version giữ nguyên', async () => {
    const a = await topic('A');
    const x = await uploadImage(await jpeg(600, 400, 1));
    const q = await question(withImage(a, x));
    const res = await transfer(donor.id, { topicIds: [a], recipientId: recipient.id });
    expect(res.json()).toEqual({
      topics: 1,
      questions: 1,
      illustrations: 1,
      exams: 0,
      detachedItems: 0,
    });

    expect((await illustrationsOf(donorCookie)).map((i) => i.id)).toEqual([]);
    expect((await illustrationsOf(recipientCookie)).map((i) => i.id)).toEqual([x]);
    const moved = await getQuestion(q, recipientCookie);
    expect(imageIdOf(moved)).toBe(x);
    expect(moved.version).toBe(1);
    expect(await usageOf(q)).toEqual([x]);
    expect(
      (await call(t.app, 'GET', `/api/media/${x}/480`, { cookie: recipientCookie })).statusCode,
    ).toBe(200);
    expect(
      (await call(t.app, 'GET', `/api/media/${x}/480`, { cookie: donorCookie })).statusCode,
    ).toBe(404);
  });

  it('ca 2: người nhận đã có ảnh sẵn sàng cùng nội dung: dùng ảnh đó, viết lại nội dung và tăng version', async () => {
    const a = await topic('A');
    const bytes = await jpeg(600, 400, 1);
    const x = await uploadImage(bytes);
    const r = await uploadImage(bytes, recipientCookie); // cùng SHA-256
    const q = await question(withImage(a, x));
    const res = await transfer(donor.id, { topicIds: [a], recipientId: recipient.id });
    expect(res.json()).toEqual({
      topics: 1,
      questions: 1,
      illustrations: 1,
      exams: 0,
      detachedItems: 0,
    });

    const moved = await getQuestion(q, recipientCookie);
    expect(imageIdOf(moved)).toBe(r);
    expect(moved.version).toBe(2);
    expect(await usageOf(q)).toEqual([r]);
    // Ảnh của người cho không bị đụng tới: vẫn trong thư viện của họ, nay không câu nào dùng.
    expect((await illustrationsOf(donorCookie)).map((i) => i.id)).toEqual([x]);
    expect((await illustrationsOf(recipientCookie)).map((i) => i.id)).toEqual([r]);
  });

  it('ca 3: ảnh còn dùng chung với câu không chuyển: sao chép cho người nhận, câu ở lại giữ ảnh cũ', async () => {
    const t1 = await topic('Chuyển');
    const t2 = await topic('Ở lại');
    const x = await uploadImage(await jpeg(600, 400, 1));
    const moving = await question(withImage(t1, x));
    const staying = await question(withImage(t2, x));
    const [original] = await illustrationsOf(donorCookie);
    const res = await transfer(donor.id, { topicIds: [t1], recipientId: recipient.id });
    expect(res.json()).toEqual({
      topics: 1,
      questions: 1,
      illustrations: 1,
      exams: 0,
      detachedItems: 0,
    });

    const [copy] = await illustrationsOf(recipientCookie);
    expect(copy).toMatchObject({ status: 'ready', variants: original?.variants });
    expect(copy?.id).not.toBe(x);
    const movedQuestion = await getQuestion(moving, recipientCookie);
    expect(imageIdOf(movedQuestion)).toBe(copy?.id);
    expect(movedQuestion.version).toBe(2);
    expect(await usageOf(moving)).toEqual([copy?.id]);
    // câu ở lại không đổi gì
    const stayed = await getQuestion(staying, donorCookie);
    expect(imageIdOf(stayed)).toBe(x);
    expect(stayed.version).toBe(1);
    expect((await illustrationsOf(donorCookie)).map((i) => i.id)).toEqual([x]);
    // bản sao có đủ file và phục vụ được cho người nhận
    for (const side of (copy?.variants ?? []).filter((v) => [480, 960, 1600].includes(v))) {
      const file = await call(t.app, 'GET', `/api/media/${copy?.id}/${side}`, {
        cookie: recipientCookie,
      });
      expect(file.statusCode).toBe(200);
    }
    // cùng SHA-256 nên người nhận tải lại đúng ảnh đó thì dùng lại bản sao, không tạo thêm
    const again = await uploadImage(await jpeg(600, 400, 1), recipientCookie);
    expect(again).toBe(copy?.id);
  });

  it('một ảnh dùng cho nhiều câu cùng được chuyển thì chỉ tính một ảnh', async () => {
    const a = await topic('A');
    const x = await uploadImage(await jpeg(600, 400, 1));
    await question(withImage(a, x));
    await question(withImage(a, x));
    const res = await transfer(donor.id, { topicIds: [a], recipientId: recipient.id });
    expect(res.json()).toEqual({
      topics: 1,
      questions: 2,
      illustrations: 1,
      exams: 0,
      detachedItems: 0,
    });
  });

  it('chép file lỗi giữa chừng (MediaStore ném lỗi): không đổi gì, file đã chép được xóa, không có thông báo', async () => {
    const t1 = await topic('Chuyển');
    const t2 = await topic('Ở lại');
    const x = await uploadImage(await jpeg(2000, 1500, 1)); // nhiều biến thể để lỗi xảy ra giữa chừng
    await question(withImage(t1, x));
    await question(withImage(t2, x));

    const store = media();
    const written: string[] = [];
    const realPut = store.put.bind(store);
    vi.spyOn(store, 'put').mockImplementation(async (key, data) => {
      if (written.length === 1) throw new Error('đĩa đầy');
      await realPut(key, data);
      written.push(key);
    });

    const res = await transfer(donor.id, { topicIds: [t1], recipientId: recipient.id });
    expect(res.statusCode).toBe(500);
    expect(written).toHaveLength(1); // đã chép được một biến thể trước khi lỗi
    for (const key of written) await expect(store.get(key)).rejects.toThrow();

    expect(await ownerOfTopic(t1)).toBe(donor.id);
    expect(await illustrationsOf(recipientCookie)).toEqual([]);
    expect(await audit('topic.transfer')).toEqual([]);
    expect((await bell(recipientCookie)).items).toEqual([]);
  });

  it('giao dịch lỗi sau khi đã chép file: hoàn tác mọi thay đổi và xóa file vừa chép', async () => {
    const t1 = await topic('Chuyển');
    const t2 = await topic('Ở lại');
    const x = await uploadImage(await jpeg(2000, 1500, 1)); // nhiều biến thể để lỗi xảy ra giữa chừng
    await question(withImage(t1, x));
    await question(withImage(t2, x));

    const store = media();
    const written: string[] = [];
    const realPut = store.put.bind(store);
    vi.spyOn(store, 'put').mockImplementation(async (key, data) => {
      await realPut(key, data);
      written.push(key);
    });
    vi.spyOn(t.app.get(NotificationsService), 'notify').mockRejectedValue(new Error('lỗi giả'));

    const res = await transfer(donor.id, { topicIds: [t1], recipientId: recipient.id });
    expect(res.statusCode).toBe(500);
    expect(written.length).toBeGreaterThan(0);
    for (const key of written) await expect(store.get(key)).rejects.toThrow();
    expect(await ownerOfTopic(t1)).toBe(donor.id);
    expect(await illustrationsOf(recipientCookie)).toEqual([]);
    expect(await audit('topic.transfer')).toEqual([]);
  });
});

describe('Xóa người dùng kèm người nhận (Q150)', () => {
  it('còn Chủ đề mà không nêu người nhận: 409 HAS_CONTENT kèm danh sách, chưa xóa gì', async () => {
    const a = await topic('Giải tích');
    await question(singleChoice(a));
    const b = await topic('Rỗng');
    const res = await removeUser(donor.id);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'HAS_CONTENT' });
    expect((res.json().topics as { id: string }[]).map((x) => x.id).sort()).toEqual([a, b].sort());
    expect(res.json().topics).toContainEqual({ id: a, name: 'Giải tích', questionCount: 1 });
    const [row] = await sql<{ removed_at: Date | null }>(
      'SELECT removed_at FROM users WHERE id = $1',
      [donor.id],
    );
    expect(row?.removed_at).toBeNull();
  });

  it('nêu người nhận: chuyển toàn bộ (cả đã Lưu trữ) rồi Xóa trong một giao dịch, nhật ký đúng thứ tự', async () => {
    const a = await topic('Giải tích');
    const q = await question(singleChoice(a));
    const b = await topic('Cũ');
    await archive(b);
    const res = await removeUser(donor.id, `?recipientId=${recipient.id}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ id: donor.id, status: 'removed' });

    expect(await ownerOfTopic(a)).toBe(recipient.id);
    expect(await ownerOfTopic(b)).toBe(recipient.id);
    expect(await getQuestion(q, recipientCookie)).toMatchObject({ id: q });
    const rows = await sql<{ action: string }>(
      "SELECT action FROM audit_logs WHERE action IN ('topic.transfer', 'user.remove') ORDER BY id",
    );
    expect(rows.map((r) => r.action)).toEqual(['topic.transfer', 'user.remove']);
    expect((await bell(recipientCookie)).items).toMatchObject([
      { type: 'topics.transferred', data: { topics: 2 } },
    ]);
    // phiên của người bị Xóa đã thu hồi
    expect((await call(t.app, 'GET', '/api/topics', { cookie: donorCookie })).statusCode).toBe(401);
  });

  it('người nhận không hợp lệ: 400 và chưa xóa gì', async () => {
    const a = await topic('A');
    const res = await removeUser(donor.id, `?recipientId=${donor.id}`);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      issues: [{ path: 'recipientId', code: 'invalid_recipient' }],
    });
    expect(await ownerOfTopic(a)).toBe(donor.id);
    const [row] = await sql<{ removed_at: Date | null }>(
      'SELECT removed_at FROM users WHERE id = $1',
      [donor.id],
    );
    expect(row?.removed_at).toBeNull();
  });

  it('không còn nội dung thì xóa như thường, bỏ qua tham số người nhận', async () => {
    const res = await removeUser(donor.id, `?recipientId=${recipient.id}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ status: 'removed' });
    expect(await audit('topic.transfer')).toEqual([]);
    expect((await bell(recipientCookie)).items).toEqual([]);
  });

  it('chuyển giao lỗi giữa chừng thì người dùng cũng không bị Xóa', async () => {
    const a = await topic('A');
    vi.spyOn(t.app.get(NotificationsService), 'notify').mockRejectedValue(new Error('lỗi giả'));
    const res = await removeUser(donor.id, `?recipientId=${recipient.id}`);
    expect(res.statusCode).toBe(500);
    expect(await ownerOfTopic(a)).toBe(donor.id);
    const [row] = await sql<{ removed_at: Date | null }>(
      'SELECT removed_at FROM users WHERE id = $1',
      [donor.id],
    );
    expect(row?.removed_at).toBeNull();
    expect(await audit('user.remove')).toEqual([]);
  });

  it('người đã bị Xóa: INVALID_STATE trước mọi việc khác (không báo HAS_CONTENT, không chép file)', async () => {
    const gone = await seedUser({ removed: true, roleTags: ['examiner'] });
    await sql(
      "INSERT INTO topics (id, owner_id, name, name_key, created_at, updated_at) VALUES (gen_random_uuid(), $1, 'Sót', 'sot', now(), now())",
      [gone.id],
    );
    expect((await removeUser(gone.id)).json()).toMatchObject({ code: 'INVALID_STATE' });
    const withRecipient = await removeUser(gone.id, `?recipientId=${recipient.id}`);
    expect(withRecipient.json()).toMatchObject({ code: 'INVALID_STATE' });
  });

  it('va chạm khóa duy nhất giữa chừng trả CONFLICT bảo thử lại thay vì lỗi 500', async () => {
    const a = await topic('A');
    vi.spyOn(t.app.get(NotificationsService), 'notify').mockRejectedValue(
      Object.assign(new Error('trùng'), { cause: { code: '23505' } }),
    );
    const res = await transfer(donor.id, { topicIds: [a], recipientId: recipient.id });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'CONFLICT', reason: 'CONTENT_CHANGED' });
    expect(await ownerOfTopic(a)).toBe(donor.id);
  });

  it('người dùng không phải Người ra đề: xóa như hiện nay', async () => {
    const student = await seedUser({ roleTags: ['candidate'] });
    const res = await removeUser(student.id);
    expect(res.statusCode).toBe(200);
  });
});
