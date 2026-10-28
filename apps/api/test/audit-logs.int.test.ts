import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetState } from './support/reset';

let pg: Client;

beforeAll(async () => {
  pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
});
afterAll(async () => {
  await pg.end();
});
beforeEach(async () => {
  await resetState();
  await pg.query(
    "INSERT INTO audit_logs (action, entity_type, at) VALUES ('cli.bootstrap-admin', 'user', now())",
  );
});

// Bất biến ở mức DB: kể cả kết nối có quyền ghi bảng cũng không sửa hay xóa được nhật ký thao tác.
describe('audit_logs chỉ ghi thêm', () => {
  it('UPDATE bị từ chối', async () => {
    await expect(pg.query("UPDATE audit_logs SET action = 'sua-lai'")).rejects.toThrow(
      /audit_logs/,
    );
  });

  it('DELETE bị từ chối', async () => {
    await expect(pg.query('DELETE FROM audit_logs')).rejects.toThrow(/audit_logs/);
  });

  it('INSERT vẫn được', async () => {
    const { rowCount } = await pg.query(
      "INSERT INTO audit_logs (action, entity_type, at) VALUES ('user.lock', 'user', now())",
    );
    expect(rowCount).toBe(1);
  });
});
