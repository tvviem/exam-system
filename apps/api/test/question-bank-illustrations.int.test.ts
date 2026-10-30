import { type QuestionInput, type RichText, textDoc } from '@exam/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MEDIA_STORE, type MediaStore } from '../src/media/media-store';
import { createTestApp, type TestApp } from './support/app';
import { call, login, upload } from './support/http';
import { brokenJpeg, gif, jpeg, jpegWithExif, noisePng, png, svg, webp } from './support/images';
import { singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let cookie: string;
let otherCookie: string;
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
  await seedUser({ username: 'sv1', roleTags: ['candidate'] });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  const topic = await call(t.app, 'POST', '/api/topics', { cookie, body: { name: 'Hình học' } });
  topicId = topic.json().id;
});

const send = (content: Buffer, filename = 'hinh.jpg', who = cookie) =>
  upload(t.app, '/api/illustrations', { filename, content }, { cookie: who });

/** Tải lên rồi chạy worker; trả về bản ghi sau xử lý. */
async function uploadReady(content: Buffer, who = cookie) {
  const res = await send(content, 'hinh.jpg', who);
  expect(res.statusCode, res.body).toBe(201);
  await t.queue.drain();
  const detail = await call(t.app, 'GET', `/api/illustrations/${res.json().id}`, { cookie: who });
  return detail.json();
}

const media = (id: string, variant: number, who = cookie) =>
  call(t.app, 'GET', `/api/media/${id}/${variant}`, { cookie: who });

const withImage = (illustrationId: string): QuestionInput => ({
  ...singleChoice(topicId),
  stem: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Xem hình' }] },
      { type: 'image', attrs: { illustrationId, alt: 'Tam giác ABC' } },
    ],
  } as RichText,
});

describe('tải Hình minh họa lên (Q138–Q141)', () => {
  it('nhận ảnh, báo đang xử lý, rồi sẵn sàng với các biến thể WebP cỡ đúng', async () => {
    const res = await send(await jpeg(2000, 1500));
    expect(res.statusCode, res.body).toBe(201);
    const { id } = res.json();
    const before = await call(t.app, 'GET', `/api/illustrations/${id}`, { cookie });
    expect(before.json()).toMatchObject({ id, status: 'processing' });
    expect((await media(id, 480)).statusCode).toBe(404); // chưa sẵn sàng thì chưa phục vụ

    await t.queue.drain();
    const ready = (await call(t.app, 'GET', `/api/illustrations/${id}`, { cookie })).json();
    expect(ready).toMatchObject({
      status: 'ready',
      width: 1600,
      height: 1200,
      variants: [480, 960, 1600],
    });
    for (const width of [480, 960, 1600]) {
      const file = await media(id, width);
      expect(file.statusCode).toBe(200);
      expect(file.headers['content-type']).toBe('image/webp');
      expect((await sharp(file.rawPayload).metadata()).width).toBe(width);
    }
  });

  it('không phóng to: ảnh nhỏ chỉ có biến thể bằng cỡ thật, xin cỡ lớn vẫn được ảnh đó', async () => {
    const { id, variants } = await uploadReady(await png(300, 200));
    expect(variants).toEqual([300]);
    const file = await media(id, 1600);
    expect((await sharp(file.rawPayload).metadata()).width).toBe(300);
  });

  it('chỉ lưu biến thể, không giữ bản gốc, và nhỏ hơn nhiều so với ảnh tải lên', async () => {
    const source = await jpeg(3000, 2000);
    const { id, bytes } = await uploadReady(source);
    expect(bytes).toBeLessThan(source.length / 2);
    const sizes = await Promise.all(
      [480, 960, 1600].map(async (w) => (await media(id, w)).rawPayload.length),
    );
    expect(bytes).toBe(sizes.reduce((a, b) => a + b, 0));
  });

  it('PNG nén không mất dữ liệu: điểm ảnh giữ nguyên', async () => {
    const source = await png(300, 200);
    const { id } = await uploadReady(source);
    const out = await sharp((await media(id, 480)).rawPayload)
      .raw()
      .toBuffer();
    expect(out.equals(await sharp(source).raw().toBuffer())).toBe(true);
  });

  it('chấp nhận cả WebP tải lên', async () => {
    expect((await uploadReady(await webp(300, 200))).status).toBe('ready');
  });

  it('xoay ảnh đúng chiều và bỏ EXIF', async () => {
    const { id } = await uploadReady(await jpegWithExif(600, 400));
    const meta = await sharp((await media(id, 960)).rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([400, 600]);
    expect(meta.exif).toBeUndefined();
  });

  it.each([
    ['SVG', () => svg(), 'hinh.svg'],
    ['GIF', () => gif(), 'hinh.gif'],
    ['file chữ đổi đuôi .jpg', () => Buffer.from('không phải ảnh'), 'hinh.jpg'],
    ['file rỗng', () => Buffer.alloc(0), 'hinh.jpg'],
  ])('từ chối %s', async (_name, make, filename) => {
    const res = await send(make(), filename);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_FAILED');
    expect(res.json().issues[0].path).toBe('file');
    expect(t.queue.pending).toBe(0);
  });

  it('từ chối file quá 5 MB', async () => {
    const big = Buffer.concat([await jpeg(100, 100), Buffer.alloc(5 * 1024 * 1024)]);
    const res = await send(big);
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0]).toEqual({ path: 'file', code: 'image_too_large' });
  });

  it('báo failed khi ảnh quá 8.000 px một cạnh, ảnh hỏng, và không để lại file', async () => {
    const wide = await sharp({
      create: { width: 8001, height: 10, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    for (const [content, reason] of [
      [wide, 'dimensions_too_large'],
      [brokenJpeg(), 'corrupt'],
    ] as const) {
      const res = await send(content);
      expect(res.statusCode, res.body).toBe(201);
      await t.queue.drain();
      const detail = (
        await call(t.app, 'GET', `/api/illustrations/${res.json().id}`, { cookie })
      ).json();
      expect(detail).toMatchObject({ status: 'failed', failureReason: reason, bytes: 0 });
      expect((await media(res.json().id, 480)).statusCode).toBe(404);
    }
  });

  it('ảnh trùng nội dung thì dùng lại ảnh có sẵn, không xử lý thêm', async () => {
    const source = await jpeg(800, 600);
    const first = await send(source);
    await t.queue.drain();
    const again = await send(source);
    expect(again.statusCode).toBe(201);
    expect(again.json()).toMatchObject({ id: first.json().id, reused: true, status: 'ready' });
    expect(t.queue.pending).toBe(0);
    const list = (await call(t.app, 'GET', '/api/illustrations', { cookie })).json();
    expect(list.total).toBe(1);
  });

  it('hai lần tải trùng nội dung cùng lúc vẫn ra một ảnh và một job', async () => {
    const source = await jpeg(800, 600);
    const queued = t.queue.history.length;
    const [a, b] = await Promise.all([send(source), send(source)]);
    expect([a.statusCode, b.statusCode], `${a.body} ${b.body}`).toEqual([201, 201]);
    expect(a.json().id).toBe(b.json().id);
    expect(t.queue.history.length - queued).toBe(1);
    const list = (await call(t.app, 'GET', '/api/illustrations', { cookie })).json();
    expect(list.total).toBe(1);
  });

  it('lỗi bất ngờ khi xử lý thì ảnh failed chứ không kẹt đang xử lý, tải lại thì xử lý lại', async () => {
    const media = t.app.get<MediaStore>(MEDIA_STORE);
    const put = media.put.bind(media);
    const source = await jpeg(800, 600);
    const res = await send(source);
    media.put = async (key, data) => {
      if (key.startsWith('illustrations/')) throw new Error('đĩa đầy');
      return put(key, data);
    };
    try {
      await t.queue.drain();
    } finally {
      media.put = put;
    }
    const failed = (
      await call(t.app, 'GET', `/api/illustrations/${res.json().id}`, { cookie })
    ).json();
    expect(failed).toMatchObject({ status: 'failed', failureReason: 'error', bytes: 0 });

    const again = await send(source);
    expect(again.json()).toMatchObject({ id: res.json().id, status: 'processing' });
    await t.queue.drain();
    expect(
      (await call(t.app, 'GET', `/api/illustrations/${res.json().id}`, { cookie })).json().status,
    ).toBe('ready');
  });

  it('ảnh trùng đã failed thì xử lý lại', async () => {
    const broken = brokenJpeg();
    const first = await send(broken);
    await t.queue.drain();
    const again = await send(broken);
    expect(again.json()).toMatchObject({ id: first.json().id, status: 'processing' });
    expect(t.queue.pending).toBe(1);
  });

  it('hai người tải cùng một ảnh thì mỗi người có ảnh riêng', async () => {
    const source = await jpeg(800, 600);
    const a = await send(source);
    const b = await send(source, 'hinh.jpg', otherCookie);
    expect(a.json().id).not.toBe(b.json().id);
  });
});

describe('hạn mức dung lượng (Q139)', () => {
  it('từ chối tải thêm khi đã đạt hạn mức, xóa ảnh thì tải lại được', async () => {
    const first = await uploadReady(await noisePng(200, 200));
    expect(first.bytes).toBeGreaterThanOrEqual(100_000);
    const refused = await send(await noisePng(100, 100));
    expect(refused.statusCode).toBe(400);
    expect(refused.json().issues[0]).toEqual({ path: 'file', code: 'quota_exceeded' });

    expect(
      (await call(t.app, 'DELETE', `/api/illustrations/${first.id}`, { cookie })).statusCode,
    ).toBe(200);
    expect((await send(await noisePng(100, 100))).statusCode).toBe(201);
  });

  it('hạn mức tính riêng từng người', async () => {
    await uploadReady(await noisePng(200, 200));
    expect((await send(await noisePng(100, 100), 'a.jpg', otherCookie)).statusCode).toBe(201);
  });
});

describe('quyền truy cập', () => {
  it('chỉ Người ra đề tải và xem; người khác không thấy ảnh của chủ', async () => {
    const { id } = await uploadReady(await jpeg(800, 600));
    const student = (await login(t.app, 'sv1', DEFAULT_PASSWORD)).cookie as string;
    expect((await send(await jpeg(100, 100), 'a.jpg', student)).statusCode).toBe(403);
    expect((await media(id, 480, student)).statusCode).toBe(403);
    expect((await media(id, 480, otherCookie)).statusCode).toBe(404);
    expect(
      (await call(t.app, 'GET', `/api/illustrations/${id}`, { cookie: otherCookie })).statusCode,
    ).toBe(404);
    expect(
      (await call(t.app, 'DELETE', `/api/illustrations/${id}`, { cookie: otherCookie })).statusCode,
    ).toBe(404);
    expect((await call(t.app, 'GET', `/api/media/${id}/480`)).statusCode).toBe(401);
    expect(
      (await call(t.app, 'GET', '/api/illustrations', { cookie: otherCookie })).json().total,
    ).toBe(0);
  });

  it('chỉ phục vụ các cỡ 480, 960, 1600', async () => {
    const { id } = await uploadReady(await jpeg(2000, 1500));
    expect((await media(id, 500)).statusCode).toBe(400);
    expect((await call(t.app, 'GET', `/api/media/${id}/orig`, { cookie })).statusCode).toBe(400);
  });

  it('ảnh phục vụ có thể lưu đệm riêng và không bị đoán kiểu', async () => {
    const { id } = await uploadReady(await jpeg(800, 600));
    const res = await media(id, 480);
    expect(res.headers['cache-control']).toContain('private');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('thư viện ảnh của tôi (Q138)', () => {
  it('liệt kê mới nhất trước, phân trang 20, kèm cờ đang được dùng', async () => {
    for (let i = 0; i < 21; i++) {
      await send(await png(40 + i, 30, i), `h${i}.png`);
    }
    await t.queue.drain();
    const first = (await call(t.app, 'GET', '/api/illustrations', { cookie })).json();
    expect(first).toMatchObject({ total: 21, page: 1, pageSize: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.items[0]).toMatchObject({ status: 'ready', inUse: false, width: 60 });
    const second = (await call(t.app, 'GET', '/api/illustrations?page=2', { cookie })).json();
    expect(second.items).toHaveLength(1);
  });
});

describe('gắn ảnh vào Câu hỏi (Q137, Q138)', () => {
  it('lưu Câu hỏi có ảnh sẵn sàng của chính chủ; ảnh đang dùng thì không xóa được', async () => {
    const { id } = await uploadReady(await jpeg(800, 600));
    const created = await call(t.app, 'POST', '/api/questions', {
      cookie,
      body: withImage(id),
    });
    expect(created.statusCode, created.body).toBe(201);
    const list = (await call(t.app, 'GET', '/api/illustrations', { cookie })).json();
    expect(list.items[0]).toMatchObject({ id, inUse: true });
    const del = await call(t.app, 'DELETE', `/api/illustrations/${id}`, { cookie });
    expect(del.statusCode).toBe(409);
    expect(del.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'ILLUSTRATION_IN_USE' });
  });

  it('gỡ ảnh khỏi Câu hỏi (sửa) hoặc xóa Câu hỏi thì xóa ảnh được', async () => {
    const { id } = await uploadReady(await jpeg(800, 600));
    const created = (
      await call(t.app, 'POST', '/api/questions', { cookie, body: withImage(id) })
    ).json();
    const plain = singleChoice(topicId);
    const updated = await call(t.app, 'PUT', `/api/questions/${created.id}`, {
      cookie,
      body: { ...plain, version: created.version },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect((await call(t.app, 'DELETE', `/api/illustrations/${id}`, { cookie })).statusCode).toBe(
      200,
    );

    const again = await uploadReady(await jpeg(800, 600, 3));
    const q2 = (
      await call(t.app, 'POST', '/api/questions', { cookie, body: withImage(again.id) })
    ).json();
    await call(t.app, 'POST', '/api/questions/delete', { cookie, body: { ids: [q2.id] } });
    expect(
      (await call(t.app, 'DELETE', `/api/illustrations/${again.id}`, { cookie })).statusCode,
    ).toBe(200);
  });

  it('nhân bản Câu hỏi giữ liên kết ảnh', async () => {
    const { id } = await uploadReady(await jpeg(800, 600));
    const created = (
      await call(t.app, 'POST', '/api/questions', { cookie, body: withImage(id) })
    ).json();
    await call(t.app, 'POST', `/api/questions/${created.id}/duplicate`, { cookie });
    await call(t.app, 'POST', '/api/questions/delete', { cookie, body: { ids: [created.id] } });
    const del = await call(t.app, 'DELETE', `/api/illustrations/${id}`, { cookie });
    expect(del.statusCode).toBe(409);
  });

  it('từ chối ảnh của người khác, ảnh chưa sẵn sàng, ảnh bị lỗi hoặc không tồn tại', async () => {
    const theirs = await uploadReady(await jpeg(800, 600, 1), otherCookie);
    const failed = (await send(brokenJpeg())).json().id;
    await t.queue.drain(); // `failed` đã được xử lý; ảnh tải sau đây còn đang chờ worker
    const stillProcessing = (await send(await jpeg(800, 600, 4))).json().id;
    for (const illustrationId of [
      theirs.id,
      stillProcessing,
      failed,
      '0b9f2c5e-3f43-4c8e-9a35-5f4f3b0d1a11',
    ]) {
      const res = await call(t.app, 'POST', '/api/questions', {
        cookie,
        body: withImage(illustrationId),
      });
      expect(res.statusCode, illustrationId).toBe(400);
      expect(res.json().issues).toEqual([{ path: 'stem', code: 'image_unavailable' }]);
    }
  });

  it('ảnh trong Phương án cũng được kiểm và tính là đang dùng', async () => {
    const { id } = await uploadReady(await jpeg(800, 600));
    const base = singleChoice(topicId);
    const body = {
      ...base,
      payload: {
        ...base.payload,
        options: [
          {
            id: 'o1',
            content: {
              type: 'doc',
              content: [{ type: 'image', attrs: { illustrationId: id, alt: 'a' } }],
            },
          },
          { id: 'o2', content: textDoc('Không có hình') },
        ],
        key: ['o1'],
      },
    };
    const res = await call(t.app, 'POST', '/api/questions', { cookie, body });
    expect(res.statusCode, res.body).toBe(201);
    expect((await call(t.app, 'DELETE', `/api/illustrations/${id}`, { cookie })).statusCode).toBe(
      409,
    );
  });

  it('tìm theo mô tả ảnh (alt)', async () => {
    const { id } = await uploadReady(await jpeg(800, 600));
    await call(t.app, 'POST', '/api/questions', { cookie, body: withImage(id) });
    const found = (await call(t.app, 'GET', '/api/questions?q=tam%20giac', { cookie })).json();
    expect(found.total).toBe(1);
  });
});
