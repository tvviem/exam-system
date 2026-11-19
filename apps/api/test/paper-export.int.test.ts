import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readDocx } from '../src/modules/paper/docx-reader.test-support';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login, upload } from './support/http';
import { jpeg } from './support/images';
import { singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { fullExam } from './support/take';
import { seedUnit } from './support/units';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// X3 (docs/plan/xuat-bo-de-thiet-ke.md mục 4 và 7): xuất Đề thi (.docx) từ Bộ đề hoặc Phiên thi đã Phát hành.

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let t: TestApp;
let examiner: string;
let otherExaminer: string;
let examId: string;
let sessionId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

beforeEach(async () => {
  await resetState();
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  const gv1 = await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  await seedUser({ username: 'an', code: 'SV001', roleTags: ['candidate'] });
  const unit = await seedUnit('KTCN', 'Khoa Kỹ thuật và Công nghệ');
  await sql(`insert into examiner_profiles (user_id, unit_id) values ($1, $2)`, [gv1.id, unit.id]);
  examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherExaminer = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  examId = (await fullExam(t, examiner, 'Giữa kỳ đủ loại')).id;
  const created = await call(t.app, 'POST', '/api/sessions', {
    cookie: examiner,
    body: {
      examId,
      title: 'Giữa kỳ - ca 1',
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T10:00:00+07:00',
      durationMinutes: 45,
      accessCode: 'AB3K9X',
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  sessionId = created.json().id as string;
});

const exportPaper = (body: Record<string, unknown>, cookie = examiner) =>
  call(t.app, 'POST', '/api/paper/exam', { cookie, body });

describe('xuất Đề thi: chủ xuất được', () => {
  it('từ Phiên thi: tệp .docx mở được, có đủ khung thông tin, Đơn vị, nội dung câu theo thứ tự', async () => {
    const res = await exportPaper({ sessionId, course: 'Giải tích 1' });

    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe(DOCX);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="de-thi-giua-ky-du-loai.docx"',
    );

    const docx = await readDocx(new Uint8Array(res.rawPayload));
    const document = await docx.part('word/document.xml');
    const text = document.text();
    expect(text).toContain('Học phần: Giải tích 1');
    expect(text).toContain('Ngày thi: 02/11/2026');
    expect(text).toContain('Thời gian: 45 phút');
    expect(text).toContain('Hình thức thi: Trắc nghiệm và tự luận');
    expect(text.indexOf('Đạo hàm của x² là gì?')).toBeLessThan(
      text.indexOf('Chọn các số nguyên tố'),
    );
    expect(text.indexOf('Chọn các số nguyên tố')).toBeLessThan(
      text.indexOf('Trình bày định nghĩa giới hạn'),
    );
    expect((await docx.part('word/header1.xml')).text()).toBe('Trường Đại học Bạc Liêu');
    expect((await docx.part('word/footer1.xml')).text()).toContain('Khoa Kỹ thuật và Công nghệ');
  });

  it('từ Bộ đề: bỏ trống ngày và thời gian (Phiên thi không có để điền)', async () => {
    const res = await exportPaper({ examId, course: 'Giải tích 1' });

    expect(res.statusCode, res.body).toBe(200);
    const text = (
      await (await readDocx(new Uint8Array(res.rawPayload))).part('word/document.xml')
    ).text();
    expect(text).toContain('Học phần: Giải tích 1');
    expect(text).toContain('Ngày thi: ');
    expect(text).not.toContain('Ngày thi: 02/11/2026');
  });
});

describe('xuất Đề thi: quyền (Q410, Q423)', () => {
  it('Người ra đề khác chủ nhận 404 (không lộ Bộ đề có tồn tại), cả từ Phiên thi lẫn Bộ đề', async () => {
    expect((await exportPaper({ sessionId, course: 'X' }, otherExaminer)).statusCode).toBe(404);
    expect((await exportPaper({ examId, course: 'X' }, otherExaminer)).statusCode).toBe(404);
    const unknown = '00000000-0000-4000-8000-000000000999';
    expect((await exportPaper({ examId: unknown, course: 'X' })).statusCode).toBe(404);
    expect((await exportPaper({ sessionId: unknown, course: 'X' })).statusCode).toBe(404);
  });

  it('Người dự thi và Quản trị viên nhận 403; chưa đăng nhập nhận 401', async () => {
    const an = (await login(t.app, 'an', DEFAULT_PASSWORD)).cookie as string;
    await seedUser({ username: 'qt', isAdmin: true });
    const admin = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
    expect((await exportPaper({ examId, course: 'X' }, an)).statusCode).toBe(403);
    expect((await exportPaper({ examId, course: 'X' }, admin)).statusCode).toBe(403);
    const anonymous = await call(t.app, 'POST', '/api/paper/exam', {
      body: { examId, course: 'X' },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('Bộ đề nháp chưa có bản chụp: 409 EXAM_NOT_PUBLISHED', async () => {
    const draft = (
      await call(t.app, 'POST', '/api/exams', { cookie: examiner, body: { title: 'Nháp' } })
    ).json();
    const res = await exportPaper({ examId: draft.id, course: 'X' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'EXAM_NOT_PUBLISHED' });
  });

  it('dữ liệu gửi lên sai: thiếu Học phần, thiếu nguồn, hoặc gửi cả hai nguồn là 400', async () => {
    expect((await exportPaper({ examId })).statusCode).toBe(400);
    expect((await exportPaper({ course: 'X' })).statusCode).toBe(400);
    expect((await exportPaper({ examId, sessionId, course: 'X' })).statusCode).toBe(400);
    expect((await exportPaper({ examId, course: '   ' })).statusCode).toBe(400);
    expect((await exportPaper({ examId, course: 'X', preset: 'khac' })).statusCode).toBe(400);
  });
});

describe('xuất Đề thi: nhật ký (mục 7)', () => {
  const rows = () =>
    sql<{ actor: string; entity_id: string; after: Record<string, unknown> }>(
      `select actor_id as actor, entity_id, after from audit_logs where action = 'paper.export'`,
    );

  it('mỗi lần xuất thành công ghi một dòng (ai, Bộ đề, Phiên thi, loại tệp, số cảnh báo), không ghi nội dung đề', async () => {
    await exportPaper({ sessionId, course: 'Chuỗi-học-phần-bí-mật' });
    const [row] = await rows();

    expect(await rows()).toHaveLength(1);
    expect(row?.entity_id).toBe(examId);
    expect(row?.after).toEqual({ kind: 'exam', sessionId, warnings: 0 });
    expect(JSON.stringify(row)).not.toContain('Chuỗi-học-phần-bí-mật');
    expect(JSON.stringify(row)).not.toContain('Đạo hàm');
  });

  it('xuất thất bại (không phải chủ, nháp, dữ liệu sai) không ghi nhật ký', async () => {
    await exportPaper({ examId, course: 'X' }, otherExaminer);
    await exportPaper({ examId, course: '' });
    expect(await rows()).toHaveLength(0);
  });
});

describe('xuất Đề thi: không lộ đáp án (bất biến)', () => {
  it('tệp Đề không chứa Đáp án đúng, hướng dẫn chấm, mã Phương án; mọi phần của gói đều được quét', async () => {
    const res = await exportPaper({ examId, course: 'Giải tích 1' });
    const docx = await readDocx(new Uint8Array(res.rawPayload));
    const everything = (
      await Promise.all(
        docx.files.filter((name) => !name.endsWith('/')).map((name) => docx.part(name)),
      )
    )
      .map((part) => part.xml)
      .join('\n');

    // hướng dẫn chấm của câu tự luận trong dữ liệu mẫu
    expect(everything).not.toContain('Nêu đủ định nghĩa ε-δ');
    // thang điểm, quy tắc chấm, khóa đáp án, mã Phương án và mã Mệnh đề của dữ liệu mẫu
    for (const secret of [
      'scoringRule',
      'ladder',
      'proportional',
      'rubric',
      '"key"',
      'o2',
      's1',
      'shuffleOptions',
    ]) {
      expect(everything).not.toContain(secret);
    }
    // nội dung hiển thị vẫn đủ (không lỡ tay xóa cả câu)
    expect(everything).toContain('2x');
    expect(everything).toContain('f đồng biến trên R');
  });
});

describe('xuất Đề thi: hình minh họa', () => {
  const api = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
    call(t.app, method, `/api${path}`, { cookie: examiner, body });
  const empty = { type: 'doc', content: [{ type: 'paragraph' }] };

  const uploadImage = async (width: number, height: number, seed: number) => {
    const res = await upload(
      t.app,
      '/api/illustrations',
      { filename: 'h.jpg', content: await jpeg(width, height, seed) },
      { cookie: examiner },
    );
    await t.queue.drain();
    return res.json().id as string;
  };

  /** Bộ đề đã Phát hành, một câu có hình `imageId` trong đề bài. */
  const examWithImage = async (imageId: string) => {
    const topic = (await api('POST', '/topics', { name: 'Hình' })).json();
    const question = await api('POST', '/questions', {
      ...singleChoice(topic.id),
      stem: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Xem hình' }] },
          { type: 'image', attrs: { illustrationId: imageId, alt: 'Hình thử' } },
        ],
      },
    });
    expect(question.statusCode, question.body).toBe(201);
    const exam = (await api('POST', '/exams', { title: 'Có hình' })).json();
    const saved = await api('PUT', `/exams/${exam.id}`, {
      title: 'Có hình',
      instructions: empty,
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: null,
          instructions: empty,
          items: [{ questionId: question.json().id, points: 1 }],
        },
      ],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const published = await api('POST', `/exams/${exam.id}/publish`, {
      version: saved.json().version,
    });
    expect(published.statusCode, published.body).toBe(200);
    return exam.id as string;
  };

  it('hình trong bản chụp được nhúng thành phần media PNG; ảnh ngoài Bộ đề không bị đưa vào', async () => {
    const imageId = await uploadImage(400, 300, 1);
    await uploadImage(400, 300, 2); // ảnh của chính người ra đề nhưng không nằm trong Bộ đề

    const res = await exportPaper({ examId: await examWithImage(imageId), course: 'Hình học' });
    expect(res.statusCode, res.body).toBe(200);
    const docx = await readDocx(new Uint8Array(res.rawPayload));
    const media = docx.files.filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );
    expect(media).toEqual(['word/media/image1.png']);
    expect([...(await docx.binary(media[0] as string)).slice(0, 4)]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    expect((await docx.part('word/document.xml')).xml).toContain('descr="Hình thử"');
    expect(JSON.parse(decodeURIComponent(res.headers['x-paper-warnings'] as string))).toEqual([]);
  });

  it('ảnh lớn có nhiều biến thể: dùng biến thể 960 px (đủ nét cho A4, không phải bản 480 hay 1600)', async () => {
    const imageId = await uploadImage(2400, 1800, 3);

    const res = await exportPaper({ examId: await examWithImage(imageId), course: 'Hình học' });
    expect(res.statusCode, res.body).toBe(200);
    const docx = await readDocx(new Uint8Array(res.rawPayload));
    const meta = await sharp(await docx.binary('word/media/image1.png')).metadata();
    expect(meta.width).toBe(960);
    expect(meta.height).toBe(720);
  });
});

describe('xuất Đề thi: độ trễ (mục 5.3, ngân sách phản hồi)', () => {
  it('Bộ đề 100 câu, 30 câu có công thức: toàn bộ yêu cầu dưới 1 giây', async () => {
    const api = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
      call(t.app, method, `/api${path}`, { cookie: examiner, body });
    const topic = (await api('POST', '/topics', { name: 'Hàng loạt' })).json();
    const ids: string[] = [];
    for (let i = 1; i <= 100; i++) {
      const stem =
        i <= 30
          ? {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: `Tính câu ${i}: ` },
                    {
                      type: 'math',
                      attrs: { latex: '\\frac{a+b}{2} + \\sqrt{x^2+1}', display: false },
                    },
                  ],
                },
              ],
            }
          : {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: `Câu ${i}` }] }],
            };
      const created = await api('POST', '/questions', { ...singleChoice(topic.id), stem });
      expect(created.statusCode, created.body).toBe(201);
      ids.push(created.json().id);
    }
    const exam = (await api('POST', '/exams', { title: 'Một trăm câu' })).json();
    const empty = { type: 'doc', content: [{ type: 'paragraph' }] };
    const saved = await api('PUT', `/exams/${exam.id}`, {
      title: 'Một trăm câu',
      instructions: empty,
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: null,
          instructions: empty,
          items: ids.map((questionId) => ({ questionId, points: 1 })),
        },
      ],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const published = await api('POST', `/exams/${exam.id}/publish`, {
      version: saved.json().version,
    });
    expect(published.statusCode, published.body).toBe(200);

    const started = performance.now();
    const res = await exportPaper({ examId: exam.id, course: 'Toán' });
    const elapsed = performance.now() - started;
    console.log(
      `xuất 100 câu (30 công thức) qua HTTP: ${elapsed.toFixed(0)} ms, ${(res.rawPayload.length / 1024).toFixed(0)} KB`,
    );

    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(decodeURIComponent(res.headers['x-paper-warnings'] as string))).toEqual([]);
    expect(elapsed).toBeLessThan(1000);
  });
});
