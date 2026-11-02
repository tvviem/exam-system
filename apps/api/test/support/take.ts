import { textDoc } from '@exam/shared';
import { expect } from 'vitest';
import type { TestApp } from './app';
import { call, login } from './http';
import { cluster, essay, multipleChoice, singleChoice } from './question-bank';
import { DEFAULT_PASSWORD } from './users';

/** Bộ đề đã Phát hành đủ bốn Loại câu, kèm id từng câu trong Bộ đề. */
export async function fullExam(t: TestApp, cookie: string, title = 'Giữa kỳ đủ loại') {
  const api = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
    call(t.app, method, `/api${path}`, { cookie, body });
  const topic = (await api('POST', '/topics', { name: `Chủ đề ${title}` })).json();
  const questions = [
    singleChoice(topic.id),
    multipleChoice(topic.id),
    cluster(topic.id),
    essay(topic.id),
  ];
  const ids: string[] = [];
  for (const question of questions) {
    const created = await api('POST', '/questions', question);
    expect(created.statusCode, created.body).toBe(201);
    ids.push(created.json().id);
  }
  const created = (await api('POST', '/exams', { title })).json();
  const saved = await api('PUT', `/exams/${created.id}`, {
    title,
    instructions: textDoc('Làm bài cẩn thận'),
    version: created.version,
    sections: [
      {
        id: created.sections[0].id,
        title: null,
        instructions: textDoc(''),
        items: ids.map((questionId) => ({ questionId, points: 1 })),
      },
    ],
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const published = await api('POST', `/exams/${created.id}/publish`, {
    version: saved.json().version,
  });
  expect(published.statusCode, published.body).toBe(200);
  return { id: created.id as string };
}

/** Một Người dự thi đã đăng nhập, giữ cookie đăng nhập và cookie thiết bị như trình duyệt. */
export class Taker {
  device: string | undefined;
  constructor(
    private readonly t: TestApp,
    readonly cookie: string,
  ) {}

  static async signIn(t: TestApp, username: string): Promise<Taker> {
    const { cookie } = await login(t.app, username, DEFAULT_PASSWORD);
    return new Taker(t, cookie as string);
  }

  /** Gọi API; `device: null` là không gửi cookie thiết bị, `string` là gửi một thiết bị khác. */
  async call(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    device: string | null | undefined = undefined,
  ) {
    const res = await call(this.t.app, method, `/api${path}`, {
      cookie: this.cookie,
      body,
      device: device === null ? undefined : (device ?? this.device),
    });
    const set = res.cookies.find((c) => c.name === 'exam_did');
    if (set) this.device = set.value;
    return res;
  }

  join(code: string) {
    return this.call('POST', '/take/join', { code });
  }
}
