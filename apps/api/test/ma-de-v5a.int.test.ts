import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readDocx } from '../src/modules/paper/docx-reader.test-support';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// V5a của "Mã đề của Phiên thi" (docs/plan/ma-de-phien-thi-thiet-ke.md mục 6, Q473): xuất tất cả Mã đề thành tệp zip và Excel phân Mã đề.
// Chạy trên PostgreSQL thật qua API, đọc lại nội dung tệp.

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
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
});

const settings = (examId: string, extra: Record<string, unknown> = {}) => ({
  examId,
  title: 'Ca 1',
  opensAt: '2026-11-02T07:00:00+07:00',
  closesAt: '2026-11-02T10:00:00+07:00',
  durationMinutes: 45,
  accessCode: 'AB3K9X',
  ...extra,
});
const createSession = (examId: string, extra: Record<string, unknown> = {}) =>
  call(t.app, 'POST', '/api/sessions', { cookie, body: settings(examId, extra) });
/** Bộ đề: Phần 1 có 5 câu rút mặc định 40 % (2 câu), Phần 2 có 2 câu lấy đủ. Mọi câu 1 điểm. */
const drawExam = (): Promise<DrawExamRef> =>
  publishedDrawExam(t, cookie, [{ points: [1, 1, 1, 1, 1], drawPercent: 40 }, { points: [1, 1] }]);

let seeded = 0;
/** Thêm `n` Người dự thi mới vào Danh sách của Phiên thi; trả id của họ. */
const addToRoster = async (sessionId: string, n: number): Promise<string[]> => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const user = await seedUser({
      username: `sv${seeded}`,
      code: `SV${seeded}`,
      roleTags: ['candidate'],
    });
    seeded++;
    ids.push(user.id);
  }
  const res = await call(t.app, 'POST', `/api/sessions/${sessionId}/roster`, {
    cookie,
    body: { userIds: ids },
  });
  expect(res.statusCode, res.body).toBe(200);
  return ids;
};
/** Mã đề (số thứ tự) của từng người trong Danh sách; `null` nếu chưa gán. */
const assignment = async (sessionId: string): Promise<Map<string, number | null>> => {
  const rows = await sql<{ user_id: string; number: number | null }>(
    `select r.user_id, v.number from session_roster r
       left join session_variants v on v.id = r.variant_id where r.session_id = $1`,
    [sessionId],
  );
  return new Map(rows.map((r) => [r.user_id, r.number]));
};

beforeEach(() => {
  seeded = 0;
});

const exportZip = (body: Record<string, unknown>, who = cookie) =>
  call(t.app, 'POST', '/api/paper/variants', { cookie: who, body: { course: 'Tin học', ...body } });
const exportAssignment = (sessionId: string, who = cookie) =>
  call(t.app, 'POST', '/api/paper/assignment', { cookie: who, body: { sessionId } });
const otherExaminer = async () => {
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  return (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
};
const variantItemIds = async (sessionId: string, number: number) =>
  (
    await sql<{ item_id: string }>(
      `select i.item_id from session_variant_items i join session_variants v on v.id = i.variant_id
        where v.session_id = $1 and v.number = $2`,
      [sessionId, number],
    )
  ).map((r) => r.item_id);
const unzip = async (res: { rawPayload: Buffer }) => JSZip.loadAsync(res.rawPayload);
const paragraphsOf = async (zip: JSZip, name: string) =>
  (
    await (
      await readDocx(
        new Uint8Array(await (zip.file(name) as JSZip.JSZipObject).async('uint8array')),
      )
    ).part('word/document.xml')
  ).paragraphs();
/** Đề bài "Câu K" của tệp Đề, đúng thứ tự (K là số thứ tự câu trong Bộ đề gốc). */
const stemsOf = (paragraphs: string[]) =>
  paragraphs.flatMap((p) => {
    const m = /^Câu \d+: Câu (\d+)$/.exec(p);
    return m ? [Number(m[1])] : [];
  });

describe('xuất tất cả Mã đề thành tệp zip', () => {
  it('mỗi Mã đề một tệp Đề .docx chỉ gồm câu của Mã đề, ô Mã đề điền sẵn; có Excel phân Mã đề; không có đáp án', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    await addToRoster(id, 6);
    const res = await exportZip({ sessionId: id });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(String(res.headers['content-disposition'])).toMatch(/filename="ma-de-.*\.zip"/);
    const zip = await unzip(res);
    const names = Object.keys(zip.files).sort();
    expect(names.filter((n) => /^de-thi-.*-de-[123]\.docx$/.test(n))).toHaveLength(3);
    expect(names.filter((n) => n.startsWith('dap-an'))).toEqual([]);
    expect(names.filter((n) => /^phan-ma-de-.*\.xlsx$/.test(n))).toHaveLength(1);
    expect(names).toHaveLength(4);
    for (const number of [1, 2, 3]) {
      const name = names.find((n) => n.endsWith(`-de-${number}.docx`)) as string;
      const paragraphs = await paragraphsOf(zip, name);
      const expected = (await variantItemIds(id, number))
        .map((itemId) => exam.itemIds.indexOf(itemId) + 1)
        .sort((a, b) => a - b);
      expect(stemsOf(paragraphs), name).toEqual(expected);
      expect(paragraphs).toContain(`Lớp: ........  Mã đề: Đề ${number}`);
    }
  });

  it('kèm tệp Đáp án khi xin và xác nhận: mỗi Mã đề một tệp, tổng điểm theo Mã đề; thiếu xác nhận thì 400', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    const bad = await exportZip({ sessionId: id, answers: true });
    expect(bad.statusCode, bad.body).toBe(400);
    const res = await exportZip({ sessionId: id, answers: true, confirm: true });
    expect(res.statusCode, res.body).toBe(200);
    const zip = await unzip(res);
    const names = Object.keys(zip.files);
    expect(names.filter((n) => /^dap-an-.*-de-[12]\.docx$/.test(n))).toHaveLength(2);
    expect(names.filter((n) => n.startsWith('de-thi'))).toHaveLength(2);
    for (const name of names.filter((n) => n.startsWith('dap-an'))) {
      expect(await paragraphsOf(zip, name), name).toContain('Tổng điểm: 4');
    }
  });

  it('người ra đề khác 404; mỗi người một đề: 409 NOT_SHARED; một Mã đề: 409 ONE_VARIANT; xuất từ Bộ đề (không có sessionId): 400', async () => {
    const exam = await drawExam();
    const shared = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    expect(
      (await exportZip({ sessionId: shared.json().id }, await otherExaminer())).statusCode,
    ).toBe(404);
    const per = await createSession(exam.id, { accessCode: 'ZZ3K9X' });
    const refused = await exportZip({ sessionId: per.json().id });
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'NOT_SHARED' });
    const one = await createSession(exam.id, { drawScope: 'shared', accessCode: 'YY3K9X' });
    const single = await exportZip({ sessionId: one.json().id });
    expect(single.statusCode, single.body).toBe(409);
    expect(single.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'ONE_VARIANT' });
    expect((await exportZip({ examId: exam.id })).statusCode).toBe(400);
  });
});

describe('Excel phân Mã đề', () => {
  const rowsOf = async (buffer: ArrayBuffer | Buffer | Uint8Array) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as ArrayBuffer);
    const rows: string[][] = [];
    workbook.worksheets[0]?.eachRow((row) =>
      rows.push((row.values as unknown[]).slice(1).map((v) => String(v ?? ''))),
    );
    return rows;
  };

  it('tải riêng: đúng cột và mỗi người ghi Mã đề được gán, giống tệp nằm trong zip', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    const ids = await addToRoster(id, 6);
    const assigned = await assignment(id);
    const res = await exportAssignment(id);
    expect(res.statusCode, res.body).toBe(200);
    expect(String(res.headers['content-type'])).toContain('spreadsheetml');
    expect(String(res.headers['content-disposition'])).toMatch(/filename="phan-ma-de-.*\.xlsx"/);
    const rows = await rowsOf(res.rawPayload);
    const header = rows.find((r) => r[0] === 'Mã định danh') as string[];
    expect(header).toEqual(['Mã định danh', 'Họ và tên', 'Lớp', 'Mã đề']);
    for (const [index, userId] of ids.entries()) {
      const row = rows.find((r) => r[0] === `SV${index}`) as string[];
      expect(row[3], `SV${index}`).toBe(`Đề ${assigned.get(userId)}`);
    }
    // Trong zip: cùng nội dung.
    const zip = await unzip(await exportZip({ sessionId: id }));
    const name = Object.keys(zip.files).find((n) => n.endsWith('.xlsx')) as string;
    const inZip = await rowsOf(await (zip.file(name) as JSZip.JSZipObject).async('uint8array'));
    expect(inZip).toEqual(rows);
  });

  it('người ra đề khác 404; mỗi người một đề 409 NOT_SHARED; một Mã đề 409 ONE_VARIANT', async () => {
    const exam = await drawExam();
    const shared = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    expect((await exportAssignment(shared.json().id, await otherExaminer())).statusCode).toBe(404);
    const per = await createSession(exam.id, { accessCode: 'ZZ3K9X' });
    const refused = await exportAssignment(per.json().id);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toMatchObject({ reason: 'NOT_SHARED' });
    const one = await createSession(exam.id, { drawScope: 'shared', accessCode: 'YY3K9X' });
    expect((await exportAssignment(one.json().id)).json()).toMatchObject({ reason: 'ONE_VARIANT' });
  });
});
