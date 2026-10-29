import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  APP_VERSION: z.string().default('dev'),
  // Thư mục lưu file (MediaStore): file tải lên tạm, Phiếu tài khoản. Trên production là volume.
  MEDIA_DIR: z.string().default('./media-data'),
  // Origin được phép gửi request đổi dữ liệu (chống CSRF), cách nhau bằng dấu phẩy.
  APP_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:4173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Biến môi trường không hợp lệ:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Nạp `.env` ở thư mục hiện tại nếu có; biến đã đặt sẵn trong môi trường được giữ nguyên. */
export function loadDotenvFile(): void {
  try {
    process.loadEnvFile();
  } catch {
    // Không có .env: dùng biến môi trường sẵn có (CI, container).
  }
}
