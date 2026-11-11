import { Logger } from '@nestjs/common';

/**
 * Gom mọi dòng log của `Logger` (Nest) trong lúc chạy `run`, để test quét xem có lộ bí mật không. Bản test tắt log
 * của Nest nên phải bắt ở đây. Trả về toàn bộ dòng đã ghi, mọi mức, kèm đối số phụ.
 */
export async function captureLogs(run: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const record = (message: unknown, ...rest: unknown[]) => {
    lines.push(
      [message, ...rest]
        .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
        .join(' '),
    );
  };
  Logger.overrideLogger({
    log: record,
    error: record,
    warn: record,
    debug: record,
    verbose: record,
    fatal: record,
  });
  try {
    await run();
  } finally {
    Logger.overrideLogger(false);
  }
  return lines;
}
