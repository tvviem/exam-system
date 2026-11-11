import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../config/env';
import { mailLimitsFromEnv, selectMailTransport } from './mail.config';

// Bài đơn vị của lát 8 (S5): cấu hình thư và chọn adapter vận chuyển. Con số mặc định (400, 300, 6 giây, 50 đến 300)
// lấy từ ADR-0009 và Q375, Q382, viết thẳng ở đây.

const base = {
  DATABASE_URL: 'postgres://exam:exam@localhost:5434/exam',
  REDIS_URL: 'redis://localhost:6381/0',
  SLIP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};
const smtp = {
  SMTP_HOST: 'smtp.example.org',
  SMTP_USERNAME: 'gui@example.org',
  SMTP_PASSWORD: 'mat-khau-ung-dung',
  EMAIL_FROM: 'gui@example.org',
};

describe('cấu hình SMTP trong loadEnv', () => {
  it('C-02: có một phần cấu hình SMTP (thiếu mật khẩu) thì khởi động thất bại và nêu rõ biến thiếu', () => {
    const { SMTP_PASSWORD: _omitted, ...partial } = smtp;
    expect(() => loadEnv({ ...base, ...partial })).toThrow(/SMTP_PASSWORD/);
  });

  it('không đặt biến SMTP nào là hợp lệ (chế độ không gửi)', () => {
    expect(() => loadEnv(base)).not.toThrow();
  });

  it('cấu hình đủ thì dùng cổng 587 và hạn chờ 15 giây mặc định', () => {
    const env = loadEnv({ ...base, ...smtp });
    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_TIMEOUT_SECONDS).toBe(15);
  });

  it('C-03: máy chủ Gmail mà EMAIL_FROM khác tài khoản SMTP thì khởi động thất bại (Gmail sẽ ghi đè người gửi)', () => {
    const gmail = {
      ...smtp,
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USERNAME: 'gui@gmail.com',
      EMAIL_FROM: 'khac@example.org',
    };
    expect(() => loadEnv({ ...base, ...gmail })).toThrow(/EMAIL_FROM/);
    expect(() => loadEnv({ ...base, ...gmail, EMAIL_FROM: 'gui@gmail.com' })).not.toThrow();
  });

  it('C-05: tên hệ thống và dòng liên hệ hỗ trợ có mặc định và đổi được bằng cấu hình', () => {
    const env = loadEnv(base);
    expect(env.EMAIL_FROM_NAME).toBe('Hệ thống kiểm tra đánh giá trực tuyến');
    expect(env.EMAIL_SUPPORT_CONTACT).toBe(
      'Cần trợ giúp, hãy liên hệ Người ra đề hoặc quản trị viên của bạn.',
    );
    const custom = loadEnv({
      ...base,
      EMAIL_FROM_NAME: 'Khảo thí Khoa CNTT',
      EMAIL_SUPPORT_CONTACT: 'Liên hệ phòng Đào tạo: 0123 456 789.',
    });
    expect(custom.EMAIL_FROM_NAME).toBe('Khảo thí Khoa CNTT');
    expect(custom.EMAIL_SUPPORT_CONTACT).toBe('Liên hệ phòng Đào tạo: 0123 456 789.');
  });
});

describe('hạn mức gửi thư từ cấu hình', () => {
  it('C-06: mặc định 400 thư mỗi 24 giờ, hàng loạt tối đa 300, cách nhau 6 giây, warm-up 50, 100, 150, 200, 300', () => {
    expect(mailLimitsFromEnv(loadEnv(base))).toEqual({
      total: 400,
      bulk: 300,
      minGapMs: 6000,
      warmupBulk: [50, 100, 150, 200, 300],
    });
  });

  it('đổi được bằng biến môi trường; warm-up rỗng nghĩa là tắt', () => {
    const env = loadEnv({
      ...base,
      EMAIL_LIMIT_TOTAL: '200',
      EMAIL_LIMIT_BULK: '150',
      EMAIL_MIN_GAP_SECONDS: '2',
      EMAIL_WARMUP_BULK: '',
    });
    expect(mailLimitsFromEnv(env)).toEqual({
      total: 200,
      bulk: 150,
      minGapMs: 2000,
      warmupBulk: [],
    });
  });

  it('trần hàng loạt không được vượt tổng (không còn chỗ dự trữ cho thư khẩn)', () => {
    expect(() => loadEnv({ ...base, EMAIL_LIMIT_TOTAL: '100', EMAIL_LIMIT_BULK: '300' })).toThrow(
      /EMAIL_LIMIT_BULK/,
    );
  });

  it('warm-up sai định dạng thì khởi động thất bại', () => {
    expect(() => loadEnv({ ...base, EMAIL_WARMUP_BULK: '50,nhiều' })).toThrow(/EMAIL_WARMUP_BULK/);
  });
});

describe('chọn adapter vận chuyển', () => {
  const env = (extra: Record<string, string>) => loadEnv({ ...base, ...extra });

  it('có đủ cấu hình SMTP thì dùng SMTP, ở mọi môi trường', () => {
    for (const NODE_ENV of ['production', 'development', 'test']) {
      expect(selectMailTransport(env({ ...smtp, NODE_ENV }))).toBe('smtp');
    }
  });

  it('thiếu cấu hình SMTP: dev và test in thư ra bảng điều khiển để thử bằng tay', () => {
    expect(selectMailTransport(env({ NODE_ENV: 'development' }))).toBe('console');
    expect(selectMailTransport(env({ NODE_ENV: 'test' }))).toBe('console');
  });

  it('C-04: production không bao giờ in thư ra bảng điều khiển; thiếu SMTP thì chế độ không gửi', () => {
    expect(selectMailTransport(env({ NODE_ENV: 'production' }))).toBe('none');
  });
});
