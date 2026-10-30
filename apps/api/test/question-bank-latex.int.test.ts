import { type QuestionInput, type RichText } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { call, login } from './support/http';
import { singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

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
  const topic = await call(t.app, 'POST', '/api/topics', { cookie, body: { name: 'Giải tích' } });
  topicId = topic.json().id;
});

const mine = (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) =>
  call(t.app, method, url, { cookie, body });

const formula = (latex: string, display = false): RichText => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Tính ' },
        { type: 'math', attrs: { latex, display } },
      ],
    },
  ],
});

const withStem = (latex: string): QuestionInput => ({
  ...singleChoice(topicId),
  stem: formula(latex),
});

describe('công thức trong Câu hỏi (Q121, Q128)', () => {
  it.each([
    ['phân số', '\\frac{1}{2}'],
    ['tích phân', '\\int_0^1 x^2\\,dx'],
    ['chữ tiếng Việt trong \\text', '\\text{Đạo hàm của } x^2 = 2x'],
    ['ma trận', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'],
  ])('nhận công thức hợp lệ: %s', async (_name, latex) => {
    const res = await mine('POST', '/api/questions', withStem(latex));
    expect(res.statusCode, res.body).toBe(201);
    expect((await mine('GET', `/api/questions/${res.json().id}`)).json().stem).toEqual(
      formula(latex),
    );
  });

  it.each([
    ['ngoặc không đóng', '\\frac{1}{'],
    ['lệnh không có', '\\khongcolenhnay{x}'],
    ['môi trường không đóng', '\\begin{pmatrix} a'],
  ])('từ chối công thức lỗi: %s', async (_name, latex) => {
    const res = await mine('POST', '/api/questions', withStem(latex));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      issues: [{ path: 'stem', code: 'math_invalid' }],
    });
  });

  it.each([
    ['\\href{https://x.y}{bấm}'],
    ['\\url{https://x.y}'],
    ['\\includegraphics{a.png}'],
    ['\\input{file}'],
    ['\\include{file}'],
    ['\\htmlClass{a}{x}'],
    ['\\htmlStyle{color:red}{x}'],
    ['x + \\href{https://x.y}{y}'],
  ])('từ chối lệnh nguy hiểm: %s', async (latex) => {
    const res = await mine('POST', '/api/questions', withStem(latex));
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([{ path: 'stem', code: 'math_forbidden' }]);
  });

  it('chỉ ra đúng Phương án có công thức lỗi', async () => {
    const input = singleChoice(topicId) as QuestionInput & {
      payload: { options: { id: string; content: RichText }[] };
    };
    input.payload.options[1] = { id: 'o2', content: formula('\\frac{') };
    const res = await mine('POST', '/api/questions', input);
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([
      { path: 'payload.options.1.content', code: 'math_invalid' },
    ]);
  });

  it('sửa Câu hỏi cũng bị kiểm công thức, bản cũ không đổi', async () => {
    const created = (await mine('POST', '/api/questions', withStem('x^2'))).json();
    const res = await mine('PUT', `/api/questions/${created.id}`, {
      ...withStem('\\href{https://x.y}{y}'),
      version: created.version,
    });
    expect(res.statusCode).toBe(400);
    const read = (await mine('GET', `/api/questions/${created.id}`)).json();
    expect(read.version).toBe(created.version);
    expect(read.stem).toEqual(formula('x^2'));
  });

  it('tìm được Câu hỏi theo lệnh LaTeX của công thức', async () => {
    await mine('POST', '/api/questions', withStem('\\frac{1}{2}'));
    await mine('POST', '/api/questions', singleChoice(topicId));
    const found = (await mine('GET', '/api/questions?q=frac')).json();
    expect(found.total).toBe(1);
  });
});
