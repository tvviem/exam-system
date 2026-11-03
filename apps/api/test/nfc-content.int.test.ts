import { textDoc } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login, upload } from './support/http';
import { singleChoice } from './support/question-bank';
import { importFile, importRow } from './support/question-import-files';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Nội dung Câu hỏi thống nhất trên toàn hệ thống: nhập dấu rời (NFD) hay dựng sẵn (NFC) đều ra đúng cùng một chuỗi ở Ngân
// hàng câu hỏi, Bộ đề đã Phát hành (bản chụp mà Lượt làm bài đọc) và khi tìm kiếm.

let t: TestApp;
let cookie: string;
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
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  topicId = (
    await call(t.app, 'POST', '/api/topics', { cookie, body: { name: 'Giải tích' } })
  ).json().id;
});

const api = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
  call(t.app, method, `/api${path}`, { cookie, body });

const STEM = 'Nguyễn Việt Hoàng giải phương trình bậc hai';
const OPTION = 'Nghiệm kép';
const nfd = (value: string) => value.normalize('NFD');
/** Mọi chữ trong một nội dung (đoạn văn đầu tiên), để so với chuỗi mong đợi. */
const textOfDoc = (doc: { content: { content?: { text?: string }[] }[] }) =>
  doc.content[0]?.content?.[0]?.text;

describe('lưu Câu hỏi', () => {
  it('lời dẫn, Phương án và hướng dẫn chấm nhập bằng dấu rời được lưu ở dạng dựng sẵn', async () => {
    const input = singleChoice(topicId);
    const payload = input.payload as unknown as { options: { content: unknown }[] };
    const created = await api('POST', '/questions', {
      ...input,
      stem: textDoc(nfd(STEM)),
      payload: {
        ...payload,
        options: [
          { id: 'o1', content: textDoc(nfd(OPTION)) },
          { id: 'o2', content: textDoc('Hai nghiệm') },
          { id: 'o3', content: textDoc('Vô nghiệm') },
        ],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const stored = (await api('GET', `/questions/${created.json().id}`)).json();
    expect(textOfDoc(stored.stem)).toBe(STEM);
    expect(textOfDoc(stored.payload.options[0].content)).toBe(OPTION);
    expect(created.body).not.toContain(nfd(STEM)); // không còn chuỗi dấu rời nào trong phản hồi
    // Tìm kiếm không dấu vẫn thấy câu này
    const found = (await api('GET', '/questions?q=nguyen%20viet')).json();
    expect(found.items).toHaveLength(1);
  });

  it('Phương án dài 1.000 chữ có dấu nhập ở dạng dấu rời vẫn được nhận (đếm theo dạng dựng sẵn)', async () => {
    const input = singleChoice(topicId);
    const payload = input.payload as unknown as { options: { content: unknown }[] };
    const created = await api('POST', '/questions', {
      ...input,
      payload: {
        ...payload,
        options: [
          { id: 'o1', content: textDoc(nfd('ệ'.repeat(1000))) },
          { id: 'o2', content: textDoc('b') },
          { id: 'o3', content: textDoc('c') },
        ],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
  });
});

describe('nhập từ Excel rồi tạo Bộ đề', () => {
  it('file Excel chứa chữ dấu rời: Câu hỏi vào Ngân hàng, Bộ đề Phát hành và bản chụp đều ở dạng dựng sẵn', async () => {
    const res = await upload(
      t.app,
      '/api/question-imports',
      await importFile(importRow(nfd(STEM), [nfd(OPTION), 'Hai nghiệm', 'Vô nghiệm'], 'A')),
      { cookie, fields: { topicId } },
    );
    expect(res.statusCode, res.body).toBe(201);
    await t.queue.drain();
    const batchId = res.json().id as string;
    const committed = await call(t.app, 'POST', `/api/question-imports/${batchId}/commit`, {
      cookie,
    });
    expect(committed.statusCode, committed.body).toBe(200);
    await t.queue.drain();

    const list = (await api('GET', `/questions?topicId=${topicId}&pageSize=100`)).json();
    expect(list.items).toHaveLength(1);
    const question = (await api('GET', `/questions/${list.items[0].id}`)).json();
    expect(textOfDoc(question.stem)).toBe(STEM);
    expect(textOfDoc(question.payload.options[0].content)).toBe(OPTION);

    // Bộ đề: tạo, Phát hành; bản chụp trong exam_items là thứ Lượt làm bài đọc
    const exam = (await api('POST', '/exams', { title: 'Giữa kỳ' })).json();
    const saved = await api('PUT', `/exams/${exam.id}`, {
      title: 'Giữa kỳ',
      instructions: textDoc(''),
      version: exam.version,
      sections: [
        {
          id: exam.sections[0].id,
          title: null,
          instructions: textDoc(''),
          items: [{ questionId: question.id, points: 1 }],
        },
      ],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const published = await api('POST', `/exams/${exam.id}/publish`, {
      version: saved.json().version,
    });
    expect(published.statusCode, published.body).toBe(200);
    const [row] = await sql<{ stem: string; first_option: string }>(
      `select snapshot->'stem'->'content'->0->'content'->0->>'text' as stem,
              snapshot->'payload'->'options'->0->'content'->'content'->0->'content'->0->>'text' as first_option
       from exam_items`,
    );
    expect(row?.stem).toBe(STEM);
    expect(row?.first_option).toBe(OPTION);
    expect(row?.stem).toHaveLength(STEM.length);
  });
});
