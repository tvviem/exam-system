import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from './support/db';
import { resetState } from './support/reset';
import { seedUser } from './support/users';

// S3: ghi thẳng vào bảng để kiểm lớp bảo vệ thứ hai ở cơ sở dữ liệu (Q217, Q222), không đi qua service.

let ownerId: string;

beforeEach(async () => {
  await resetState();
  ownerId = (await seedUser({ username: 'gv1', roleTags: ['examiner'] })).id;
});

async function exam(status: 'draft' | 'published' | 'archived' = 'published') {
  const [row] = await sql<{ id: string }>(
    `insert into exams (id, owner_id, title, instructions, status)
     values (gen_random_uuid(), $1, 'Giữa kỳ', '{}'::jsonb, $2) returning id`,
    [ownerId, status],
  );
  return (row as { id: string }).id;
}

interface Overrides {
  examId?: string;
  code?: string;
  opens?: string;
  closes?: string;
  duration?: number;
  attempts?: number;
  cancelled?: boolean;
}

async function session(over: Overrides = {}) {
  const examId = over.examId ?? (await exam());
  const [row] = await sql<{ id: string }>(
    `insert into sessions (id, exam_id, owner_id, title, opens_at, closes_at, duration_minutes,
       max_attempts, access_code, cancelled_at)
     values (gen_random_uuid(), $1, $2, 'Ca 1', $3, $4, $5, $6, $7, $8) returning id`,
    [
      examId,
      ownerId,
      over.opens ?? '2026-12-01T01:00:00Z',
      over.closes ?? '2026-12-01T03:00:00Z',
      over.duration ?? 45,
      over.attempts ?? 1,
      over.code ?? 'AB3K9X',
      over.cancelled ? '2026-11-30T00:00:00Z' : null,
    ],
  );
  return (row as { id: string }).id;
}

describe('Mã vào thi duy nhất theo thời gian (Q222)', () => {
  it('hai Phiên thi chưa hủy trùng mã mà Khung giờ chồng nhau thì bị từ chối', async () => {
    await session();
    await expect(
      session({ opens: '2026-12-01T02:00:00Z', closes: '2026-12-01T05:00:00Z' }),
    ).rejects.toThrow(/sessions_access_code_window_excl/);
  });

  it('chạm nhau đúng một mốc giờ vẫn là chồng nhau (giờ đóng là giờ cuối được bắt đầu)', async () => {
    await session();
    await expect(
      session({ opens: '2026-12-01T03:00:00Z', closes: '2026-12-01T05:00:00Z' }),
    ).rejects.toThrow(/sessions_access_code_window_excl/);
  });

  it('cùng mã nhưng Khung giờ không chồng nhau thì được', async () => {
    await session();
    await session({ opens: '2026-12-01T03:00:00.001Z', closes: '2026-12-01T05:00:00Z' });
  });

  it('khác mã thì cùng Khung giờ được', async () => {
    await session();
    await session({ code: 'ZZ9K3X' });
  });

  it('Phiên thi đã hủy không giữ mã', async () => {
    await session({ cancelled: true });
    await session();
  });
});

describe('ràng buộc giá trị', () => {
  it.each([
    ['giờ đóng không sau giờ mở', { closes: '2026-12-01T01:00:00Z' }, /sessions_window_check/],
    ['Thời lượng 0', { duration: 0 }, /sessions_duration_check/],
    ['Thời lượng 601', { duration: 601 }, /sessions_duration_check/],
    ['0 lượt làm', { attempts: 0 }, /sessions_attempts_check/],
    ['6 lượt làm', { attempts: 6 }, /sessions_attempts_check/],
    ['mã viết thường', { code: 'ab3k9x' }, /sessions_access_code_check/],
    ['mã 3 ký tự', { code: 'AB3' }, /sessions_access_code_check/],
    ['mã 13 ký tự', { code: 'ABCDEFGHJKMNP' }, /sessions_access_code_check/],
  ])('từ chối %s', async (_name, over: Overrides, message) => {
    await expect(session(over)).rejects.toThrow(message);
  });

  it('giờ cộng sẵn ngoài 0–600 bị từ chối', async () => {
    const sessionId = await session();
    const user = await seedUser({ username: 'sv1', roleTags: ['candidate'] });
    for (const minutes of [-1, 601]) {
      await expect(
        sql(
          `insert into session_roster (session_id, user_id, added_by, extra_minutes) values ($1, $2, $3, $4)`,
          [sessionId, user.id, ownerId, minutes],
        ),
      ).rejects.toThrow(/session_roster_extra_check/);
    }
  });
});

describe('trigger của Phiên thi', () => {
  it('không tạo Phiên thi cho Bộ đề nháp', async () => {
    await expect(session({ examId: await exam('draft') })).rejects.toThrow(/chua phat hanh/);
  });

  it('không tạo Phiên thi mới cho Bộ đề đã Lưu trữ', async () => {
    const examId = await exam('archived');
    await expect(session({ examId })).rejects.toThrow(/da luu tru/);
  });

  it('Hủy Phiên thi không hoàn tác được', async () => {
    const id = await session({ cancelled: true });
    await expect(
      sql(`update sessions set cancelled_at = null where id = $1`, [id]),
    ).rejects.toThrow(/khong hoan tac/);
  });

  it('Phiên thi chưa hủy hủy được và đổi nội dung sau khi hủy thì bị chặn', async () => {
    const id = await session();
    await sql(`update sessions set cancelled_at = now() where id = $1`, [id]);
    await expect(sql(`update sessions set title = 'Khác' where id = $1`, [id])).rejects.toThrow(
      /da huy/,
    );
  });
});

describe('trigger của Danh sách dự thi (Q144)', () => {
  it('Người ra đề không tự thêm mình vào Danh sách', async () => {
    const sessionId = await session();
    await expect(
      sql(`insert into session_roster (session_id, user_id, added_by) values ($1, $2, $2)`, [
        sessionId,
        ownerId,
      ]),
    ).rejects.toThrow(/Nguoi ra de/);
  });

  it('Người dự thi khác thêm được; thêm hai lần là trùng khóa', async () => {
    const sessionId = await session();
    const user = await seedUser({ username: 'sv1', roleTags: ['candidate'] });
    const add = () =>
      sql(`insert into session_roster (session_id, user_id, added_by) values ($1, $2, $3)`, [
        sessionId,
        user.id,
        ownerId,
      ]);
    await add();
    await expect(add()).rejects.toThrow(/session_roster_session_id_user_id_pk/);
  });
});
