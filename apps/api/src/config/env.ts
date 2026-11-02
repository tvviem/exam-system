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
  // Số kết nối Postgres tối đa của MỖI tiến trình (api và worker mỗi bên một nhóm); tổng phải nhỏ hơn max_connections.
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Ai được tin khi báo địa chỉ khách qua X-Forwarded-For: `loopback` (nginx cùng pod) hoặc danh sách địa chỉ/dải cách
  // nhau bằng dấu phẩy. Sai cấu hình thì mọi người cùng một IP và giới hạn đăng nhập theo IP chung.
  TRUST_PROXY: z
    .string()
    .min(1)
    .refine((value) => !/^\d+$/.test(value.trim()), { message: 'không nhận số bước trung gian' })
    .default('loopback'),
  // Khóa AES-256-GCM mã hóa Phiếu tài khoản (32 byte, base64). Tạo bằng: openssl rand -base64 32
  SLIP_ENCRYPTION_KEY: z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
    message: 'phải là 32 byte mã hóa base64 (openssl rand -base64 32)',
  }),
  // Thư mục lưu file (MediaStore): file tải lên tạm, Phiếu tài khoản. Trên production là volume.
  MEDIA_DIR: z.string().default('./media-data'),
  // Hạn mức dung lượng Hình minh họa mỗi Người ra đề (Q139), mặc định 500 MB.
  ILLUSTRATION_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(500 * 1024 * 1024),
  // Nếu có (ví dụ /_media), api trả ảnh bằng X-Accel-Redirect để nginx đọc file thay vì api (Q141).
  MEDIA_ACCEL_PREFIX: z.string().optional(),
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

/** Đổi `TRUST_PROXY` thành giá trị `trustProxy` của Fastify. */
export function parseTrustProxy(value: string): string | string[] {
  const text = value.trim();
  if (text.includes(','))
    return text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  return text;
}

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
