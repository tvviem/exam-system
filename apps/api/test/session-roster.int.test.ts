import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type ExamRef, publishedExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let cookie: string;
let otherCookie: string;
let ownerId: string;
let exam: ExamRef;
let sessionId: string;
const candidates: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const api = (method: string, path: string, body?: unknown, who = cookie) =>
  call(t.app, method as 'GET', `/api${path}`, { cookie: who, body });

beforeEach(async () => {
  await resetState();
  // Người ra đề cũng mang Nhãn Người dự thi (Q143) để kiểm owner_cannot_sit.
  ownerId = (
    await seedUser({ username: 'gv1', roleTags: ['examiner', 'candidate'], code: 'GV001' })
  ).id;
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  const people: [string, string, string, string][] = [
    ['an', 'SV001', 'Nguyễn Văn An', 'K65-A'],
    ['binh', 'SV002', 'Trần Thị Bình', 'K65-A'],
    ['chi', 'SV003', 'Lê Thị Chi', 'K65-B'],
    ['dung', 'SV004', 'Phạm Dũng', 'K65-B'],
  ];
  for (const [username, code, fullName, classLabel] of people) {
    candidates[username] = (
      await seedUser({ username, code, fullName, classLabel, roleTags: ['candidate'] })
    ).id;
  }
  exam = await publishedExam(t, cookie);
  const created = await api('POST', '/sessions', {
    examId: exam.id,
    title: 'Giữa kỳ - ca 1',
    opensAt: '2026-11-10T08:00:00+07:00',
    closesAt: '2026-11-10T10:00:00+07:00',
    durationMinutes: 45,
    accessCode: 'AB3K9X',
  });
  expect(created.statusCode, created.body).toBe(201);
  sessionId = created.json().id;
});

const roster = (who = cookie) => api('GET', `/sessions/${sessionId}/roster`, undefined, who);
const add = (body: unknown, who = cookie) =>
  api('POST', `/sessions/${sessionId}/roster`, body, who);
const names = (items: { fullName: string }[]) => items.map((i) => i.fullName).sort();

describe('sắp Danh sách dự thi theo thứ tự từ điển tiếng Việt', () => {
  const rosterNames = async (query = '') =>
    (await api('GET', `/sessions/${sessionId}/roster${query}`))
      .json()
      .items.map((i: { fullName: string }) => i.fullName);

  async function addPeople(fullNames: string[]) {
    const ids: string[] = [];
    for (const [index, fullName] of fullNames.entries()) {
      ids.push(
        (
          await seedUser({
            username: `vn${index}`,
            code: `VN${String(index).padStart(3, '0')}`,
            fullName,
            roleTags: ['candidate'],
          })
        ).id,
      );
    }
    await add({ userIds: ids });
  }

  it('xếp theo bảng chữ cái: a ă â b c d đ e ê ... o ô ơ ... u ư; Đ đứng sau D, không lẫn với D', async () => {
    await addPeople([
      'Nguyễn Văn Ưu',
      'Nguyễn Văn Ơn',
      'Nguyễn Văn Ông',
      'Nguyễn Văn Ôn',
      'Nguyễn Văn Em',
      'Nguyễn Văn Êm',
      'Nguyễn Văn Đức',
      'Nguyễn Văn Điệp',
      'Nguyễn Văn Duy',
      'Nguyễn Văn Dũng',
      'Nguyễn Văn Bình',
      'Nguyễn Văn Ân',
      'Nguyễn Văn Ăn',
      'Nguyễn Văn Anh',
    ]);
    const given = (await rosterNames())
      .filter((n: string) => n.startsWith('Nguyễn Văn'))
      .map((n: string) => n.split(' ').at(-1));
    expect(given).toEqual([
      'Anh',
      'Ăn',
      'Ân',
      'Bình',
      'Dũng',
      'Duy',
      'Điệp',
      'Đức',
      'Em',
      'Êm',
      'Ôn',
      'Ông',
      'Ơn',
      'Ưu',
    ]);
  });

  it('cùng chữ cái thì thanh điệu theo thứ tự: không dấu, huyền, hỏi, ngã, sắc, nặng', async () => {
    await addPeople(['Lê Văn Bạ', 'Lê Văn Bá', 'Lê Văn Bã', 'Lê Văn Bả', 'Lê Văn Bà', 'Lê Văn Ba']);
    const given = (await rosterNames())
      .filter((n: string) => n.startsWith('Lê Văn'))
      .map((n: string) => n.split(' ').at(-1));
    expect(given).toEqual(['Ba', 'Bà', 'Bả', 'Bã', 'Bá', 'Bạ']);
  });

  it('trùng tên gọi thì xếp tiếp theo họ rồi tên lót, cũng theo từ điển (Đ sau D)', async () => {
    await addPeople(['Trần Đức Anh', 'Trần Dũng Anh', 'Phạm Văn Anh', 'Âu Văn Anh', 'Ao Văn Anh']);
    const all = (await rosterNames()).filter((n: string) => n.endsWith(' Anh'));
    expect(all).toEqual([
      'Ao Văn Anh',
      'Âu Văn Anh',
      'Phạm Văn Anh',
      'Trần Dũng Anh',
      'Trần Đức Anh',
    ]);
  });
});

describe('sắp Danh sách dự thi theo Mã định danh', () => {
  const codes = async (query: string) =>
    (await api('GET', `/sessions/${sessionId}/roster${query}`))
      .json()
      .items.map((i: { code: string | null }) => i.code);

  it('sort=code xếp từng ký tự (chữ và số, không phân biệt hoa thường), người chưa có mã đứng cuối; mặc định vẫn theo tên', async () => {
    await sql(`update users set code = $2 where id = $1`, [candidates.an, '237480201003']);
    await sql(`update users set code = $2 where id = $1`, [candidates.binh, '237480201001']);
    await sql(`update users set code = $2 where id = $1`, [candidates.chi, 'sv02']);
    await sql(`update users set code = null where id = $1`, [candidates.dung]);
    await add({ classLabel: 'K65-A' });
    await add({ classLabel: 'K65-B' });

    expect(await codes('?sort=code')).toEqual(['237480201001', '237480201003', 'sv02', null]);
    // Mặc định (và sort=name) xếp theo tên gọi: An, Bình, Chi, Dũng.
    expect(await codes('')).toEqual(['237480201003', '237480201001', 'sv02', null]);
    expect(await codes('?sort=name')).toEqual(['237480201003', '237480201001', 'sv02', null]);
  });

  it('sort=code vẫn phân trang đúng và từ chối giá trị lạ', async () => {
    await add({ classLabel: 'K65-A' });
    await add({ classLabel: 'K65-B' });
    expect(await codes('?sort=code&page=2&pageSize=3')).toEqual(['SV004']);
    expect((await api('GET', `/sessions/${sessionId}/roster?sort=tuoi`)).statusCode).toBe(400);
  });
});

describe('tìm người để thêm vào Danh sách dự thi (Q200)', () => {
  const search = (q: string) =>
    api('GET', `/sessions/${sessionId}/roster/search?q=${encodeURIComponent(q)}`);

  it('tìm theo tên không dấu, theo Mã định danh, và gợi ý Lớp khớp', async () => {
    const byName = (await search('tran thi')).json();
    expect(names(byName.users)).toEqual(['Trần Thị Bình']);
    const byCode = (await search('sv003')).json();
    expect(names(byCode.users)).toEqual(['Lê Thị Chi']);
    const byClass = (await search('k65-a')).json();
    expect(byClass.classes).toEqual([{ label: 'K65-A', count: 2 }]);
  });

  it('không gợi ý Người ra đề, người đã Khóa, đã Xóa hay không có Nhãn Người dự thi', async () => {
    await seedUser({
      username: 'khoa',
      fullName: 'Khóa Thử',
      status: 'locked',
      roleTags: ['candidate'],
    });
    await seedUser({
      username: 'xoa',
      fullName: 'Xóa Thử',
      removed: true,
      roleTags: ['candidate'],
    });
    await seedUser({ username: 'gv3', fullName: 'Giáo Thử', roleTags: ['examiner'] });
    for (const q of ['thu', 'GV001', 'nguyen van']) {
      const found = (await search(q)).json().users as { fullName: string }[];
      expect(names(found), q).not.toContain('Khóa Thử');
      expect(names(found), q).not.toContain('Xóa Thử');
      expect(names(found), q).not.toContain('Giáo Thử');
    }
    expect(names((await search('GV001')).json().users)).toEqual([]);
  });

  it('đánh dấu người đã có trong Danh sách', async () => {
    await add({ userIds: [candidates.an] });
    const found = (await search('sv00')).json().users as { fullName: string; inRoster: boolean }[];
    expect(found.find((u) => u.fullName === 'Nguyễn Văn An')?.inRoster).toBe(true);
    expect(found.find((u) => u.fullName === 'Trần Thị Bình')?.inRoster).toBe(false);
  });

  it('tìm rỗng thì không trả gì', async () => {
    expect((await search('  ')).json()).toEqual({ users: [], classes: [] });
  });
});

describe('thêm vào Danh sách dự thi', () => {
  it('theo người: thêm, báo kết quả, ghi Lớp tại lúc thêm và gửi thông báo', async () => {
    const res = await add({ userIds: [candidates.an, candidates.chi] });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ added: 2, alreadyIn: 0, notFound: [], ineligible: [] });

    const listed = (await roster()).json();
    expect(listed.total).toBe(2);
    expect(listed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: candidates.an,
          code: 'SV001',
          fullName: 'Nguyễn Văn An',
          classLabel: 'K65-A',
          extraMinutes: 0,
        }),
      ]),
    );
    const notices = await sql(`select user_id, type, data from notifications order by user_id`);
    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({ type: 'session.added' });
    expect((notices[0] as { data: object }).data).toMatchObject({
      sessionId,
      title: 'Giữa kỳ - ca 1',
    });
  });

  it('thêm lần nữa thì báo đã có và không gửi thông báo thêm', async () => {
    await add({ userIds: [candidates.an] });
    const res = await add({ userIds: [candidates.an, candidates.binh] });
    expect(res.json()).toMatchObject({ added: 1, alreadyIn: 1 });
    expect(await sql('select 1 from notifications')).toHaveLength(2);
  });

  it('theo Lớp: chụp tại lúc bấm, đổi Lớp sau đó không làm đổi Danh sách', async () => {
    const res = await add({ classLabel: 'K65-B' });
    expect(res.json()).toMatchObject({ added: 2 });
    await sql(`update users set class_label = 'K66-X' where id = $1`, [candidates.chi]);
    const listed = (await roster()).json().items as { fullName: string; classLabel: string }[];
    expect(listed.map((i) => [i.fullName, i.classLabel]).sort()).toEqual([
      ['Lê Thị Chi', 'K65-B'],
      ['Phạm Dũng', 'K65-B'],
    ]);
  });

  it('theo danh sách Mã định danh dán vào: không phân biệt hoa thường, báo mã không tìm thấy', async () => {
    const res = await add({ codes: ['sv001', 'SV002', 'KHONGCO', 'sv001'] });
    expect(res.json()).toMatchObject({ added: 2, notFound: ['KHONGCO'] });
  });

  it('dryRun báo kết quả nhưng không ghi gì và không gửi thông báo', async () => {
    await add({ userIds: [candidates.an] });
    const res = await add({ codes: ['SV001', 'SV002', 'XXX'], dryRun: true });
    expect(res.json()).toMatchObject({ added: 1, alreadyIn: 1, notFound: ['XXX'], dryRun: true });
    expect((await roster()).json().total).toBe(1);
    expect(await sql('select 1 from notifications')).toHaveLength(1);
  });

  it('Người ra đề không tự thêm mình (Q144), người Khóa, Xóa hay không phải Người dự thi bị bỏ qua kèm lý do', async () => {
    const locked = await seedUser({ username: 'khoa', status: 'locked', roleTags: ['candidate'] });
    const plain = await seedUser({ username: 'gv3', roleTags: ['examiner'] });
    const removed = await seedUser({ username: 'xoa', removed: true, roleTags: ['candidate'] });
    const res = await add({ userIds: [ownerId, locked.id, plain.id, removed.id, candidates.an] });
    expect(res.json()).toMatchObject({ added: 1 });
    expect(res.json().ineligible).toEqual(
      expect.arrayContaining([
        { userId: ownerId, reason: 'owner_cannot_sit' },
        { userId: locked.id, reason: 'locked' },
        { userId: plain.id, reason: 'not_candidate' },
        { userId: removed.id, reason: 'not_candidate' },
      ]),
    );
    expect(res.json().ineligible).toHaveLength(4);
  });

  it('Mã định danh của chính Người ra đề cũng bị chặn', async () => {
    const res = await add({ codes: ['GV001'] });
    expect(res.json()).toMatchObject({
      added: 0,
      ineligible: [{ userId: ownerId, reason: 'owner_cannot_sit' }],
    });
  });

  it('một thân yêu cầu phải có đúng một cách chọn', async () => {
    expect((await add({})).statusCode).toBe(400);
    expect((await add({ userIds: [candidates.an], classLabel: 'K65-A' })).statusCode).toBe(400);
    expect((await add({ userIds: ['không-phải-uuid'] })).statusCode).toBe(400);
  });

  it('người khác không thấy Phiên thi này; Người dự thi không vào được', async () => {
    expect((await add({ userIds: [candidates.an] }, otherCookie)).statusCode).toBe(404);
    expect((await roster(otherCookie)).statusCode).toBe(404);
    const candidateCookie = (await login(t.app, 'an', DEFAULT_PASSWORD)).cookie as string;
    expect((await add({ userIds: [candidates.an] }, candidateCookie)).statusCode).toBe(403);
  });
});

describe('giới hạn 500 người (Q200)', () => {
  async function bulkCandidates(count: number, classLabel: string) {
    await sql(
      `insert into users (id, username, code, full_name, class_label, password_hash)
       select gen_random_uuid(), 'bulk' || n, 'BULK' || n, 'Bulk ' || n, $2, 'x'
       from generate_series(1, $1::int) n`,
      [count, classLabel],
    );
    await sql(
      `insert into user_role_tags (user_id, tag) select id, 'candidate' from users where class_label = $1`,
      [classLabel],
    );
  }

  it('đủ 500 thì được, vượt thì INVALID_STATE ROSTER_FULL và không thêm ai', async () => {
    await bulkCandidates(500, 'BIG');
    expect((await add({ classLabel: 'BIG' })).json().added).toBe(500);
    const res = await add({ userIds: [candidates.an] });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'ROSTER_FULL', limit: 500 });
    expect((await roster()).json().total).toBe(500);
  });

  it('cả lớp vượt giới hạn thì không thêm ai', async () => {
    await bulkCandidates(501, 'BIG');
    const res = await add({ classLabel: 'BIG' });
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'ROSTER_FULL' });
    expect((await roster()).json().total).toBe(0);
  });
});

describe('xem Danh sách dự thi', () => {
  it('tìm trong Danh sách theo tên không dấu hoặc mã, sắp theo tên gọi rồi họ lót (cách xếp danh sách lớp), phân trang', async () => {
    await add({ classLabel: 'K65-A' });
    await add({ classLabel: 'K65-B' });
    const all = (await roster()).json();
    expect(all.total).toBe(4);
    expect(all.items.map((i: { fullName: string }) => i.fullName)).toEqual([
      'Nguyễn Văn An',
      'Trần Thị Bình',
      'Lê Thị Chi',
      'Phạm Dũng',
    ]);
    const byName = (await api('GET', `/sessions/${sessionId}/roster?q=binh`)).json();
    expect(names(byName.items)).toEqual(['Trần Thị Bình']);
    const byCode = (await api('GET', `/sessions/${sessionId}/roster?q=SV004`)).json();
    expect(names(byCode.items)).toEqual(['Phạm Dũng']);
    const page2 = (await api('GET', `/sessions/${sessionId}/roster?page=2&pageSize=3`)).json();
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(4);
  });

  it('chi tiết Phiên thi đếm đúng số người', async () => {
    await add({ classLabel: 'K65-A' });
    expect((await api('GET', `/sessions/${sessionId}`)).json().rosterCount).toBe(2);
  });
});

describe('bớt người và phút cộng sẵn', () => {
  const remove = (body: unknown, who = cookie) =>
    api('DELETE', `/sessions/${sessionId}/roster`, body, who);

  it('bớt đúng những người chỉ định, bỏ qua người không có trong Danh sách', async () => {
    await add({ classLabel: 'K65-A' });
    const res = await remove({ userIds: [candidates.an, candidates.chi] });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ removed: 1 });
    expect(names((await roster()).json().items)).toEqual(['Trần Thị Bình']);
  });

  it('người khác không bớt được; thiếu userIds là 400', async () => {
    await add({ classLabel: 'K65-A' });
    expect((await remove({ userIds: [candidates.an] }, otherCookie)).statusCode).toBe(404);
    expect((await remove({})).statusCode).toBe(400);
    expect((await roster()).json().total).toBe(2);
  });

  it('đặt phút cộng sẵn cho một người, 0–600', async () => {
    await add({ userIds: [candidates.an] });
    const patch = (extraMinutes: unknown) =>
      api('PATCH', `/sessions/${sessionId}/roster/${candidates.an}`, { extraMinutes });
    const ok = await patch(15);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({ userId: candidates.an, extraMinutes: 15 });
    expect((await roster()).json().items[0].extraMinutes).toBe(15);
    expect((await patch(0)).json().extraMinutes).toBe(0);
    for (const bad of [-1, 601, 1.5, 'x'])
      expect((await patch(bad)).statusCode, String(bad)).toBe(400);
  });

  it('phút cộng sẵn cho người không có trong Danh sách là 404', async () => {
    const res = await api('PATCH', `/sessions/${sessionId}/roster/${candidates.an}`, {
      extraMinutes: 5,
    });
    expect(res.statusCode).toBe(404);
  });

  it('Phiên thi Đã đóng không thêm, bớt hay chỉnh giờ được', async () => {
    const past = await api('POST', '/sessions', {
      examId: exam.id,
      title: 'Đã qua',
      opensAt: '2026-11-01T07:00:00+07:00',
      closesAt: '2026-11-01T09:00:00+07:00',
      durationMinutes: 45,
      accessCode: 'PAST22',
    });
    const pastId = past.json().id as string;
    await sql(`insert into session_roster (session_id, user_id, added_by) values ($1, $2, $3)`, [
      pastId,
      candidates.an,
      ownerId,
    ]);
    const base = `/sessions/${pastId}/roster`;
    for (const res of [
      await api('POST', base, { userIds: [candidates.binh] }),
      await api('DELETE', base, { userIds: [candidates.an] }),
      await api('PATCH', `${base}/${candidates.an}`, { extraMinutes: 5 }),
    ]) {
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'WINDOW_CLOSED' });
    }
  });
});

describe('đổi giờ thì báo người trong Danh sách (Q211)', () => {
  const settings = (over: Record<string, unknown> = {}) => ({
    examId: exam.id,
    title: 'Giữa kỳ - ca 1',
    opensAt: '2026-11-10T08:00:00+07:00',
    closesAt: '2026-11-10T10:00:00+07:00',
    durationMinutes: 45,
    accessCode: 'AB3K9X',
    version: 1,
    ...over,
  });
  const rescheduleNotices = () =>
    sql(`select user_id, data from notifications where type = 'session.rescheduled'`);

  it('đổi giờ mở hoặc giờ đóng thì mỗi người nhận một thông báo mang giờ mới', async () => {
    await add({ userIds: [candidates.an, candidates.binh] });
    const res = await api(
      'PUT',
      `/sessions/${sessionId}`,
      settings({ opensAt: '2026-11-10T09:00:00+07:00' }),
    );
    expect(res.statusCode, res.body).toBe(200);
    const notices = await rescheduleNotices();
    expect(notices.map((n) => (n as { user_id: string }).user_id).sort()).toEqual(
      [candidates.an, candidates.binh].sort(),
    );
    expect((notices[0] as { data: object }).data).toMatchObject({
      sessionId,
      title: 'Giữa kỳ - ca 1',
      opensAt: '2026-11-10T02:00:00.000Z',
      closesAt: '2026-11-10T03:00:00.000Z',
    });
  });

  it('chỉ đổi tên, mã hay Thời lượng thì không báo', async () => {
    await add({ userIds: [candidates.an] });
    const res = await api(
      'PUT',
      `/sessions/${sessionId}`,
      settings({ title: 'Đổi tên', accessCode: 'ZZ9K3X', durationMinutes: 60 }),
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(await rescheduleNotices()).toHaveLength(0);
  });

  it('Phiên thi chưa có ai trong Danh sách thì không báo ai', async () => {
    await api('PUT', `/sessions/${sessionId}`, settings({ closesAt: '2026-11-10T12:00:00+07:00' }));
    expect(await rescheduleNotices()).toHaveLength(0);
  });
});
