import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// R5 (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 5): một luồng liền mạch từ soạn Bộ đề tới Kết quả, qua mọi đường đã sửa ở R1 đến R4.
//
// Bộ đề 34 câu: Phần I 20 câu chọn một × 1 điểm (mặc định rút 50 % = 10 câu); Phần II 10 câu chọn một × 2 điểm (Phiên thi ghi
// đè 50 % = 5 câu); Phần III 4 câu tự luận × 5 điểm (đủ 4 câu). Mỗi người nhận 19 câu, tối đa 10 + 10 + 20 = 40 điểm.

let t: TestApp;
let examiner: string;
let exam: DrawExamRef;
let sessionId: string;
const names = ['an', 'binh', 'chi', 'dung'];
const userIds: Record<string, string> = {};
const takers: Record<string, Taker> = {};
const attemptIds: Record<string, string> = {};
const views: Record<string, { sections: { items: { itemId: string; type: string }[] }[] }> = {};

beforeAll(async () => {
  t = await createTestApp();
  await resetState();
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  for (const [i, name] of names.entries()) {
    userIds[name] = (
      await seedUser({ username: name, code: `SV00${i + 1}`, roleTags: ['candidate'] })
    ).id;
  }
  examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  exam = await publishedDrawExam(t, examiner, [
    { drawPercent: 50, points: Array(20).fill(1) },
    { points: Array(10).fill(2) },
    { kind: 'essay', points: Array(4).fill(5) },
  ]);
  const created = await api('POST', '/sessions', {
    examId: exam.id,
    title: 'Giữa kỳ rút câu',
    opensAt: '2026-11-02T07:00:00+07:00',
    closesAt: '2026-11-02T10:00:00+07:00',
    durationMinutes: 45,
    accessCode: 'TL3X9K',
    sectionDraws: [{ sectionId: exam.sectionIds[1], percent: 50 }],
  });
  expect(created.statusCode, created.body).toBe(201);
  sessionId = created.json().id;
  await api('POST', `/sessions/${sessionId}/roster`, { userIds: Object.values(userIds) });
});
afterAll(async () => {
  await t.app.close();
});

const api = (method: 'GET' | 'PUT' | 'POST', path: string, body?: unknown) =>
  call(t.app, method, `/api${path}`, { cookie: examiner, body });

const itemsOf = (name: string) => (views[name]?.sections ?? []).flatMap((s) => s.items);

describe('luồng liền mạch của Phiên thi rút câu', () => {
  it('Người ra đề thấy cấu hình: mỗi người nhận 19 câu trong 34', async () => {
    const detail = (await api('GET', `/sessions/${sessionId}`)).json();
    expect(detail.sectionDraws.map((r: { drawCount: number }) => r.drawCount)).toEqual([10, 5, 4]);
    expect(
      detail.sectionDraws.map((r: { overridePercent: number | null }) => r.overridePercent),
    ).toEqual([null, 50, null]);
    const preview = (await api('GET', `/sessions/${sessionId}/try`)).json();
    expect(preview.draw).toEqual({ count: 19, total: 34 });
  });

  it('bốn Người dự thi vào thi: ai cũng 19 câu, bộ câu khác nhau giữa người với người, và tải lại không đổi', async () => {
    for (const name of names) {
      const taker = await Taker.signIn(t, name);
      await taker.join('TL3X9K');
      const res = await taker.call('POST', `/take/sessions/${sessionId}/start`);
      expect(res.statusCode, res.body).toBe(200);
      takers[name] = taker;
      views[name] = res.json();
      attemptIds[name] = res.json().attempt.id;
      expect(itemsOf(name)).toHaveLength(19);
      expect(views[name]?.sections.map((s) => s.items.length)).toEqual([10, 5, 4]);
      const again = (await taker.call('GET', `/take/attempts/${attemptIds[name]}`)).json();
      expect(
        again.sections.flatMap((s: { items: { itemId: string }[] }) =>
          s.items.map((i) => i.itemId),
        ),
      ).toEqual(itemsOf(name).map((i) => i.itemId));
    }
    const firsts = new Set(
      names.map((n) =>
        itemsOf(n)
          .slice(0, 10)
          .map((i) => i.itemId)
          .join(),
      ),
    );
    expect(firsts.size).toBeGreaterThan(1);
    // Danh sách của Người dự thi báo đúng số câu và bài rút ngẫu nhiên.
    const list = (await (takers.an as Taker).call('GET', '/take/sessions')).json();
    expect(list.items.find((i: { sessionId: string }) => i.sessionId === sessionId)).toMatchObject({
      questionCount: 19,
      drawnFrom: 34,
    });
  });

  it('làm bài và nộp: An đúng hết, Bình sai Phần I, Chi bỏ trắng trắc nghiệm, Dũng chỉ viết tự luận', async () => {
    const plans: Record<string, (type: string, sectionIndex: number) => unknown> = {
      an: (type) => (type === 'essay' ? { text: 'Bài của An' } : { optionId: 'o2' }),
      binh: (type, s) =>
        type === 'essay' ? { text: 'Bài của Bình' } : { optionId: s === 0 ? 'o1' : 'o2' },
      chi: () => undefined,
      dung: (type) => (type === 'essay' ? { text: 'Bài của Dũng' } : undefined),
    };
    for (const name of names) {
      const items = (views[name]?.sections ?? []).flatMap((s, sectionIndex) =>
        s.items.flatMap((item) => {
          const value = (plans[name] as (type: string, s: number) => unknown)(
            item.type,
            sectionIndex,
          );
          return value === undefined ? [] : [{ itemId: item.itemId, clientSeq: 1, value }];
        }),
      );
      const taker = takers[name] as Taker;
      if (items.length > 0) {
        const saved = await taker.call('PUT', `/take/attempts/${attemptIds[name]}/responses`, {
          items,
        });
        expect(saved.statusCode, saved.body).toBe(200);
      }
      expect(
        (await taker.call('POST', `/take/attempts/${attemptIds[name]}/submit`)).statusCode,
      ).toBe(200);
    }
    await t.queue.drain();
    // Chấm tự động chỉ tạo điểm cho 19 câu của mỗi người.
    for (const name of names) {
      const rows = await sql<{ item_id: string }>(
        `select item_id from response_grades where attempt_id = $1`,
        [attemptIds[name]],
      );
      expect(rows.map((r) => r.item_id).sort()).toEqual(
        itemsOf(name)
          .map((i) => i.itemId)
          .sort(),
      );
    }
  });

  it('chấm tay tự luận: mỗi người chỉ có 4 bài tự luận của mình; chấm điểm rồi Công bố', async () => {
    await api('GET', `/sessions/${sessionId}/results`);
    const items = (await api('GET', `/sessions/${sessionId}/grading/items`)).json().items as {
      total: number;
      pending: number;
    }[];
    expect(items).toHaveLength(4);
    // 3 người có chữ × 4 câu tự luận; Chi bỏ trắng nên tự được 0 và không nằm trong hàng đợi chấm.
    expect(items.reduce((n, i) => n + i.total, 0)).toBe(12);
    const essayScore: Record<string, number> = { an: 5, binh: 2.5, dung: 5 };
    for (const name of names.filter((n) => n !== 'chi')) {
      for (const item of itemsOf(name).filter((i) => i.type === 'essay')) {
        const res = await api(
          'PUT',
          `/sessions/${sessionId}/grading/attempts/${attemptIds[name]}/items/${item.itemId}`,
          { score: essayScore[name] },
        );
        expect(res.statusCode, res.body).toBe(200);
      }
    }
    t.clock.set(new Date('2026-11-02T10:30:00+07:00'));
    const released = await api('POST', `/sessions/${sessionId}/release`, { appealPeriodDays: 3 });
    expect(released.statusCode, released.body).toBe(200);
  });

  it('bảng Kết quả: tối đa 40 điểm mỗi người, điểm thô và thang 10 tính theo 40', async () => {
    const res = (await api('GET', `/sessions/${sessionId}/results`)).json();
    expect(res.session).toMatchObject({ totalItems: 19, maxScore: 40 });
    const byCode = Object.fromEntries(
      res.people.map((p: { code: string }) => [p.code, p]),
    ) as Record<string, { rawScore: number; scaledScore: number; maxScore: number }>;
    // An: 10 + 10 (trắc nghiệm đúng hết) + 20 (4 × 5) = 40 → 10,0.
    expect(byCode.SV001).toMatchObject({ rawScore: 40, scaledScore: 10, maxScore: 40 });
    // Bình: Phần I sai (0), Phần II đúng 5 × 2 = 10, tự luận 4 × 2,5 = 10 → 20 → 5,0.
    expect(byCode.SV002).toMatchObject({ rawScore: 20, scaledScore: 5, maxScore: 40 });
    // Chi: trắc nghiệm trắng, tự luận 0 → 0.
    expect(byCode.SV003).toMatchObject({ rawScore: 0, scaledScore: 0 });
    // Dũng: trắc nghiệm trắng, tự luận 4 × 5 = 20 → 5,0.
    expect(byCode.SV004).toMatchObject({ rawScore: 20, scaledScore: 5 });
  });

  it('Kết quả của Người dự thi: điểm thô x/40, thang 10, chỉ 19 câu của chính họ; Phúc khảo theo 19 câu', async () => {
    const mine = (
      await (takers.binh as Taker).call('GET', `/take/sessions/${sessionId}/result`)
    ).json();
    expect(mine.summary).toMatchObject({
      rawScore: 20,
      maxScore: 40,
      finalScore: 20,
      scaledScore: 5,
      percent: 50,
    });
    expect(mine.items).toHaveLength(19);
    const numbers = mine.items
      .map((i: { no: number }) => i.no)
      .sort((a: number, b: number) => a - b);
    expect(numbers).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    const appeals = (
      await (takers.binh as Taker).call('GET', `/take/sessions/${sessionId}/appeals`)
    ).json();
    expect(appeals.limit).toBe(3); // max(3, ceil(10 % × 19)) — theo số câu rút, không phải 34
  });

  it('Excel: "Điểm tối đa mỗi người" 40, bảng có Điểm sau Mức xử lý, trang Chi tiết để trống câu không được rút', async () => {
    const res = await call(t.app, 'GET', `/api/sessions/${sessionId}/results.xlsx`, {
      cookie: examiner,
    });
    expect(res.statusCode).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const summary: string[][] = [];
    workbook
      .getWorksheet('Tổng hợp')
      ?.eachRow((row) =>
        summary.push((row.values as unknown[]).slice(1).map((v) => String(v ?? ''))),
      );
    expect(summary).toContainEqual(['Điểm tối đa mỗi người', '40']);
    expect(summary).toContainEqual(['Tổng số câu', '19 câu']);
    const header = summary.find((r) => r[0] === 'Mã định danh') as string[];
    expect(header).toContain('Điểm sau Mức xử lý');
    expect(header).toContain('Điểm quy đổi (thang 10)');
    const an = summary.find((r) => r[0] === 'SV001') as string[];
    expect(an.slice(4)).toEqual(['40', '40', '40', '10', '']);
    const detail = workbook.getWorksheet('Chi tiết');
    const row = detail?.getRow(2).values as unknown[];
    expect(row.slice(3)).toHaveLength(34);
    expect(row.slice(3).filter((v) => v !== '' && v !== undefined && v !== null)).toHaveLength(19);
  });
});
