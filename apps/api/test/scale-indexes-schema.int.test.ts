import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';

// Chỉ mục cho quy mô lớn (docs/plan/quy-mo-lon-thiet-ke.md mục 3.2 và 4.2): migration phải tạo đủ. Tốc độ đo ở bài đo riêng.

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

describe('chỉ mục cho quy mô lớn', () => {
  it('có đủ chỉ mục, đúng cột và điều kiện từng phần', async () => {
    const rows = await sql<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const definition = new Map(
      rows.map((r) => [r.indexname, r.indexdef.replace(/^.* USING /, '')]),
    );
    expect(
      Object.fromEntries(
        [
          'questions_owner_recent_idx',
          'questions_owner_archived_idx',
          'exam_items_question_idx',
          'users_created_idx',
          'users_code_lower_idx',
          'users_class_lower_idx',
        ].map((name) => [name, definition.get(name)]),
      ),
    ).toEqual({
      questions_owner_recent_idx: 'btree (owner_id, updated_at, id) WHERE (archived_at IS NULL)',
      questions_owner_archived_idx:
        'btree (owner_id, updated_at, id) WHERE (archived_at IS NOT NULL)',
      exam_items_question_idx: 'btree (question_id)',
      users_created_idx: 'btree (created_at, id) WHERE (removed_at IS NULL)',
      users_code_lower_idx: 'btree (lower(code)) WHERE (removed_at IS NULL)',
      users_class_lower_idx: 'btree (lower(class_label)) WHERE (removed_at IS NULL)',
    });
  });

  it('có thống kê trên lower(code): thiếu nó PostgreSQL ước lượng sai và bỏ qua chỉ mục tra mã', async () => {
    const rows = await sql<{ name: string }>(
      `SELECT stxname AS name FROM pg_statistic_ext WHERE stxname = 'users_code_lower_stat'`,
    );
    expect(rows).toEqual([{ name: 'users_code_lower_stat' }]);
  });
});
