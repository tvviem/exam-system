import { z } from 'zod';

const baseEnvSchema = z.object({
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
  // Hai tin `monitor.changed` liền nhau cách nhau ít nhất chừng này (ms); test đặt nhỏ để khỏi chờ 2 giây thật.
  REALTIME_THROTTLE_MS: z.coerce.number().int().min(50).max(60_000).default(2000),
  // Số kết nối Socket.IO tối đa của một người (nhiều tab, nhiều thiết bị); quá thì bắt tay bị từ chối.
  REALTIME_MAX_SOCKETS_PER_USER: z.coerce.number().int().min(1).max(10_000).default(20),
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
  // Gửi email (ADR-0009). Không đặt nhóm SMTP_* thì hệ thống ở chế độ "không gửi"; đặt thì phải đặt đủ.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USERNAME: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  EMAIL_FROM: z.email().optional(),
  EMAIL_REPLY_TO: z.email().optional(),
  EMAIL_FROM_NAME: z.string().min(1).default('BLUNI Exam'),
  EMAIL_SUPPORT_CONTACT: z
    .string()
    .min(1)
    .default('Cần trợ giúp, hãy liên hệ Người ra đề hoặc quản trị viên của bạn.'),
  SMTP_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(120).default(15),
  // Hạn mức gửi thư (Q375, Q382): tổng mỗi 24 giờ trượt, phần dành cho thư hàng loạt, khoảng cách giữa hai thư,
  // và trần thư hàng loạt các ngày đầu (warm-up, rỗng là tắt).
  EMAIL_LIMIT_TOTAL: z.coerce.number().int().min(1).default(400),
  EMAIL_LIMIT_BULK: z.coerce.number().int().min(1).default(300),
  EMAIL_MIN_GAP_SECONDS: z.coerce.number().min(0).default(6),
  EMAIL_WARMUP_BULK: z
    .string()
    .default('50,100,150,200,300')
    .transform((value, ctx) => {
      const numbers = value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map(Number);
      if (numbers.some((n) => !Number.isInteger(n) || n < 1)) {
        ctx.addIssue({
          code: 'custom',
          message: 'phải là danh sách số nguyên dương cách nhau bằng dấu phẩy, hoặc rỗng để tắt',
        });
        return z.NEVER;
      }
      return numbers;
    }),
});

const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  const smtp = {
    SMTP_HOST: env.SMTP_HOST,
    SMTP_USERNAME: env.SMTP_USERNAME,
    SMTP_PASSWORD: env.SMTP_PASSWORD,
    EMAIL_FROM: env.EMAIL_FROM,
  };
  const set = Object.entries(smtp).filter(([, value]) => value !== undefined);
  if (set.length > 0 && set.length < Object.keys(smtp).length) {
    for (const [name, value] of Object.entries(smtp)) {
      if (value === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: 'thiếu: đã đặt một phần cấu hình SMTP thì phải đặt đủ bốn biến',
        });
      }
    }
  }
  // Gmail ghi đè người gửi bằng tài khoản đăng nhập, nên thư sẽ mang địa chỉ khác với cấu hình.
  if (
    env.SMTP_HOST &&
    /(^|\.)(gmail|googlemail)\.com$/i.test(env.SMTP_HOST) &&
    env.EMAIL_FROM &&
    env.SMTP_USERNAME &&
    env.EMAIL_FROM.toLowerCase() !== env.SMTP_USERNAME.toLowerCase()
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['EMAIL_FROM'],
      message: 'với Gmail phải trùng SMTP_USERNAME (Gmail sẽ ghi đè người gửi)',
    });
  }
  if (env.EMAIL_LIMIT_BULK > env.EMAIL_LIMIT_TOTAL) {
    ctx.addIssue({
      code: 'custom',
      path: ['EMAIL_LIMIT_BULK'],
      message: 'không được vượt EMAIL_LIMIT_TOTAL (phải còn chỗ dự trữ cho thư khẩn)',
    });
  }
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
  const result = baseEnvSchema.pick({ DATABASE_URL: true }).safeParse(source);
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
