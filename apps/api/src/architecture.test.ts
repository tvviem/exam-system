import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A1 (Q223, Q228): ranh giới module. Một module không đọc bảng (file `*.schema`) của module khác; cần dữ liệu của
// module khác thì đi qua cổng trong `common/`. Import service công khai hoặc decorator xác thực vẫn được phép.
// Riêng file `*.schema.ts` của chính module được import bảng khác để khai báo khóa ngoại (DB có khóa ngoại thật).

const modulesDir = path.resolve(__dirname, 'modules');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

/** Các cặp "module nhập → module bị nhập bảng" của mọi import chéo module. */
function crossModuleSchemaImports(): { from: string; to: string; file: string }[] {
  const found: { from: string; to: string; file: string }[] = [];
  for (const module of readdirSync(modulesDir)) {
    for (const file of sourceFiles(path.join(modulesDir, module))) {
      if (file.endsWith('.schema.ts')) continue;
      const text = readFileSync(file, 'utf8');
      // Mọi chuỗi đường dẫn tương đối (import tĩnh, `import()`, `require`, nháy đơn hay kép, có hay không đuôi `.js`) trỏ vào
      // file `*schema` của module khác. Đích được tính bằng cách phân giải thật nên số lần `../` không làm lọt.
      for (const match of text.matchAll(/['"](\.{1,2}\/[^'"]*schema)(?:\.js)?['"]/g)) {
        const target = path.resolve(path.dirname(file), match[1] as string);
        const relative = path.relative(modulesDir, target);
        if (relative.startsWith('..')) continue; // ra ngoài `modules/` (ví dụ `db/schema`) xử lý bên dưới
        const to = relative.split(path.sep)[0] as string;
        if (to !== module) found.push({ from: module, to, file: path.relative(modulesDir, file) });
      }
      // `db/schema` gom bảng của mọi module nên cũng là đường đọc bảng module khác.
      if (/['"](?:\.\.\/)+db\/schema['"]/.test(text)) {
        found.push({ from: module, to: 'db/schema', file: path.relative(modulesDir, file) });
      }
    }
  }
  return found;
}

// Nợ cũ, ghi lại để không tăng thêm (slice-4.md Q228). Xóa dần từng cặp khi tách cổng.
const KNOWN_DEBT = new Set([
  'exam->question-bank',
  'exam->identity',
  'question-bank->identity',
  'notifications->identity',
  'audit->identity',
]);

describe('A1: ranh giới module', () => {
  const imports = crossModuleSchemaImports();

  it.each(['session', 'attempt'])('%s không import bảng của module khác', (module) => {
    const bad = imports.filter((i) => i.from === module).map((i) => `${i.file} -> ${i.to}`);
    expect(bad).toEqual([]);
  });

  // Nợ cũ kiểm theo cặp module, chưa theo từng file: thêm file mới trong cặp nợ cũ vẫn lọt (chấp nhận, xóa dần).
  it('không có cặp import bảng chéo module nào mới ngoài danh sách nợ cũ', () => {
    const unknown = [...new Set(imports.map((i) => `${i.from}->${i.to}`))].filter(
      (pair) =>
        !KNOWN_DEBT.has(pair) && !pair.startsWith('session->') && !pair.startsWith('attempt->'),
    );
    expect(unknown).toEqual([]);
  });
});
