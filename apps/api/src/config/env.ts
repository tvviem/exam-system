import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  APP_VERSION: z.string().default('dev'),
  // Số lần thử đăng nhập tối đa mỗi IP trong 10 phút (Q47). Cả lớp dùng chung Wi-Fi nên không đặt thấp;
  // E2E nâng cao vì mọi test đăng nhập từ cùng một IP.
  LOGIN_MAX_PER_IP: z.coerce.number().int().positive().default(20),
  // Khóa AES-256-GCM mã hóa Phiếu tài khoản (32 byte, base64). Tạo bằng: openssl rand -base64 32
  SLIP_ENCRYPTION_KEY: z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
    message: 'phải là 32 byte mã hóa base64 (openssl rand -base64 32)',
  }),
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

/** Chỉ `DATABASE_URL`: lệnh migration chạy trước khi triển khai nên không được đòi các khóa khác. */
export function loadDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const result = envSchema.pick({ DATABASE_URL: true }).safeParse(source);
  if (!result.success) {
    throw new Error(`Biến môi trường không hợp lệ:\n${z.prettifyError(result.error)}`);
  }
  return result.data.DATABASE_URL;
}

/** Nạp `.env` ở thư mục hiện tại nếu có; biến đã đặt sẵn trong môi trường được giữ nguyên. */
export function loadDotenvFile(): void {
  try {
    process.loadEnvFile();
  } catch {
    // Không có .env: dùng biến môi trường sẵn có (CI, container).
  }
}
