import { simpleParser } from 'mailparser';
import { describe, expect, it } from 'vitest';
import { composeMail, type SenderIdentity } from './compose-mail';
import type { MailKind } from './mail.ports';
import { type MailBrand, type MailContent, renderMail } from './mail-templates';

// Lát 9 (S3): dựng thư THẬT (nội dung và MIME) cho cả sáu loại rồi phân tích lại bằng một bộ đọc thư độc lập
// (mailparser), kiểm các điều kiện giảm vào Spam của Q382 (docs/plan/slice-7-phuong-an-b-email.md mục 5 và 13).

const BRAND: MailBrand = {
  systemName: 'BLUni Exam - Hệ thống thi trực tuyến Trường Đại học Bạc Liêu',
  shortName: 'BLUni Exam',
  supportContact: 'Cần trợ giúp, hãy liên hệ Người ra đề hoặc quản trị viên của bạn.',
};
const SENDER: SenderIdentity = {
  fromName: 'BLUni Exam',
  fromEmail: 'khaothi@example.edu.vn',
  replyTo: 'hotro@example.edu.vn',
};
const LINK_HOST = 'exam.example.edu.vn';
// 07:35 UTC = 14:35 giờ Việt Nam
const EXPIRES = new Date('2026-11-18T07:35:00Z');
const CHANGED = new Date('2026-11-12T13:05:00Z'); // 20:05 giờ Việt Nam

const LINK_KINDS: MailKind[] = ['activation', 'invitation', 'password_reset', 'email_change'];
const NOTICE_KINDS: MailKind[] = ['password_changed', 'email_changed_notice'];
const ALL_KINDS: MailKind[] = [...LINK_KINDS, ...NOTICE_KINDS];

const content = (extra: Partial<MailContent> = {}): MailContent => ({
  fullName: 'Nguyễn Văn An',
  username: 'sv2026001',
  code: 'SV2026001',
  link: `https://${LINK_HOST}/lien-ket#ma-thu-nghiem-0123456789abcdefghijklmnopq`,
  expiresAt: EXPIRES,
  requesterName: 'Trần Thị Bình',
  changedAt: CHANGED,
  browser: 'Chrome 130',
  os: 'Windows 11',
  newEmail: 'moi@example.com',
  ...extra,
});

async function build(kind: MailKind, extra: Partial<MailContent> = {}) {
  const message = renderMail(kind, content(extra), BRAND);
  const raw = await composeMail(
    { to: 'an@example.com', ...message },
    SENDER,
    new Date('2026-11-12T08:00:00Z'),
  );
  const parsed = await simpleParser(raw);
  return { message, raw: raw.toString('utf8'), parsed };
}

const links = (text: string) => text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];

describe.each(ALL_KINDS)('thư loại %s: đầu mục và cấu trúc MIME', (kind) => {
  it('T-01..T-06: đủ đầu mục chuẩn, multipart/alternative gồm văn bản thuần và HTML, UTF-8, tiêu đề đúng chuẩn', async () => {
    const { raw, parsed } = await build(kind);
    expect(parsed.from?.value[0]).toMatchObject({
      name: 'BLUni Exam',
      address: 'khaothi@example.edu.vn',
    });
    expect(parsed.replyTo?.value[0]?.address).toBe('hotro@example.edu.vn');
    expect(parsed.to).toBeDefined();
    expect(parsed.date).toEqual(new Date('2026-11-12T08:00:00Z'));
    expect(parsed.messageId).toMatch(/^<[^@>]+@example\.edu\.vn>$/);
    expect(parsed.headers.get('mime-version')).toBe('1.0');
    expect(parsed.headers.get('auto-submitted')).toBe('auto-generated');
    expect(raw).toMatch(/Content-Type: multipart\/alternative/i);
    expect(raw).toMatch(/Content-Type: text\/plain; charset=utf-8/i);
    expect(raw).toMatch(/Content-Type: text\/html; charset=utf-8/i);

    // Tiêu đề tiếng Việt giải mã đúng, có tên NGẮN của hệ thống (tên đầy đủ nằm ở thân thư), không viết hoa toàn bộ, không dấu chấm than.
    expect(parsed.subject).toContain(BRAND.shortName);
    expect(parsed.subject).not.toContain('Hệ thống thi trực tuyến');
    expect(parsed.subject).not.toBe(parsed.subject?.toUpperCase());
    expect(parsed.subject).not.toContain('!');
    expect(parsed.text).toContain('Nguyễn Văn An');
    expect(parsed.html).toContain('Nguyễn Văn An');
  });

  it('T-11: không có List-Unsubscribe (thư giao dịch, Q382); không tệp đính kèm, không ảnh, không điểm theo dõi', async () => {
    const { raw, parsed } = await build(kind);
    // mailparser gom mọi đầu mục List-* vào khóa `list` nên phải kiểm trên văn bản MIME gốc.
    expect(raw).not.toMatch(/^List-/im);
    expect(parsed.headers.has('list')).toBe(false);
    expect(parsed.attachments).toEqual([]);
    expect(String(parsed.html)).not.toMatch(/<img|<iframe|<script|<link|url\(/i);
  });

  it('văn bản thuần và HTML mang cùng nội dung: mọi dòng chữ chính của bản thuần đều có trong bản HTML', async () => {
    const { message } = await build(kind);
    const plainWords = message.text.replace(/\s+/g, ' ').match(/[\p{L}\p{N}]{4,}/gu) ?? [];
    const htmlText = message.html.replace(/<[^>]*>/g, ' ');
    for (const word of plainWords) expect(htmlText).toContain(word);
  });
});

describe.each(LINK_KINDS)('thư loại %s có liên kết', (kind) => {
  it('T-07: đúng một liên kết, chữ hiển thị trùng đích, thuộc tên miền cấu hình, không rút gọn URL', async () => {
    const { message } = await build(kind);
    const textLinks = links(message.text);
    expect(textLinks).toHaveLength(1);
    expect(new URL(textLinks[0] as string).host).toBe(LINK_HOST);

    const anchors = [...message.html.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)];
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.[1]).toBe(textLinks[0]);
    expect(anchors[0]?.[2]).toBe(textLinks[0]); // chữ hiển thị trùng đích
  });

  it('T-08: có họ tên và giờ hết hạn cụ thể theo giờ Việt Nam; không có cụm "còn N ngày"', async () => {
    const { message } = await build(kind);
    expect(message.text).toContain('Nguyễn Văn An');
    expect(message.text).toContain('14:35 ngày 18/11/2026');
    expect(message.html).toContain('14:35 ngày 18/11/2026');
    expect(message.text).not.toMatch(/còn\s+\d+\s+(ngày|giờ|phút)/i);
  });

  it('nhắc không chia sẻ liên kết, nêu dòng liên hệ hỗ trợ cấu hình được và ai gửi', async () => {
    const { message } = await build(kind);
    expect(message.text).toMatch(/không chia sẻ/i);
    expect(message.text).toContain(BRAND.supportContact);
    expect(message.text).toContain('Trần Thị Bình');
  });

  it('thiếu liên kết hoặc hạn hết hạn là lỗi lập trình: ném lỗi chứ không gửi thư hỏng', () => {
    expect(() => renderMail(kind, content({ link: undefined }), BRAND)).toThrow(/link/);
    expect(() => renderMail(kind, content({ expiresAt: undefined }), BRAND)).toThrow(/expiresAt/);
  });
});

describe('thư loại activation', () => {
  it('nêu tên đăng nhập và dặn kiểm Spam hoặc Quảng cáo (Q382)', async () => {
    const { message } = await build('activation');
    expect(message.text).toContain('sv2026001');
    expect(message.text).toMatch(/Spam/);
  });

  it('T-13: tên hệ thống đầy đủ, họ tên, tên đăng nhập và giờ hết hạn được làm nổi bật; tiêu đề giữ ngắn', async () => {
    const { message, parsed } = await build('activation');
    // Tên hệ thống đầy đủ ở thân thư (cả hai bản), tiêu đề chỉ có tên ngắn.
    expect(message.text).toContain(BRAND.systemName);
    expect(message.html).toContain(BRAND.systemName);
    expect(parsed.subject).toBe('Kích hoạt tài khoản BLUni Exam');
    // HTML: họ tên, tên đăng nhập và giờ hết hạn nằm trong thẻ đậm riêng (không chỉ dựa vào màu).
    for (const bold of ['Nguyễn Văn An', 'sv2026001', '14:35 ngày 18/11/2026']) {
      const inStrong = new RegExp(`<strong[^>]*>\\s*[^<]*${bold}[^<]*</strong>`);
      expect(message.html, bold).toMatch(inStrong);
    }
    // Bản thuần: mỗi thông tin một dòng có nhãn.
    expect(message.text).toMatch(/^Họ tên: Nguyễn Văn An$/m);
    expect(message.text).toMatch(/^Tên đăng nhập \(mã định danh\): sv2026001$/m);
    // Vẫn đúng MỘT liên kết, chữ hiển thị trùng đích (T-07), nhưng trình bày nổi bật (khối viền đậm), không phải chữ thường.
    const anchor = message.html.match(/<a\s[^>]*style="([^"]*)"[^>]*>/);
    expect(anchor?.[1]).toMatch(/border:\s*2px/);
    expect(anchor?.[1]).toMatch(/font-weight:\s*700/);
  });

  it('T-13b: nhãn "(mã định danh)" chỉ khi tên đăng nhập THẬT SỰ là mã của người đó (tên đăng nhập có thể là email hoặc khác mã)', () => {
    const label = (extra: Partial<MailContent>) =>
      renderMail('activation', content(extra), BRAND).text.match(/^Tên đăng nhập[^:\n]*:/m)?.[0];
    expect(label({ username: 'sv2026001', code: 'SV2026001' })).toBe(
      'Tên đăng nhập (mã định danh):',
    );
    // Người không có mã: tên đăng nhập là email.
    expect(label({ username: 'an@example.com', code: null })).toBe('Tên đăng nhập:');
    expect(label({ username: 'an@example.com', code: undefined })).toBe('Tên đăng nhập:');
    // Tài khoản khôi phục giữ tên đăng nhập cũ khác mã hiện tại.
    expect(label({ username: 'tên-cũ', code: 'SV2026001' })).toBe('Tên đăng nhập:');
  });

  it('T-14: họ tên, tên đăng nhập và tên hệ thống độc hại bị thoát ký tự ở thẻ thông tin và đầu thư', () => {
    const hostile = '<img src=x onerror=alert(1)> "&\'';
    const message = renderMail('activation', content({ fullName: hostile, username: hostile }), {
      ...BRAND,
      systemName: hostile,
      shortName: 'BLUni\r\nBcc: x@example.com',
    });
    expect(message.html).not.toMatch(/<img|<script/i);
    expect(message.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(message.text).toContain(hostile); // bản thuần giữ nguyên chữ
    expect(message.subject).not.toMatch(/[\r\n]/);
  });
});

describe.each(ALL_KINDS)('thư loại %s: tên hệ thống đầy đủ', (kind) => {
  it('T-15a: thân thư ghi tên hệ thống đầy đủ ở cả hai bản; tiêu đề chỉ tên ngắn', async () => {
    const { message, parsed } = await build(kind);
    expect(message.text).toContain(BRAND.systemName);
    expect(message.html).toContain(BRAND.systemName);
    expect(parsed.subject).not.toContain('Hệ thống thi trực tuyến');
  });
});

describe('thẻ thông tin tài khoản chỉ có ở thư kích hoạt và lời mời', () => {
  it('T-15b: thư lời mời có thẻ họ tên và tên đăng nhập, nhãn chỉ "Tên đăng nhập" (Người ra đề không có mã định danh)', async () => {
    const { message } = await build('invitation');
    expect(message.text).toMatch(/^Họ tên: Nguyễn Văn An$/m);
    expect(message.text).toMatch(/^Tên đăng nhập: sv2026001$/m);
    expect(message.text).not.toContain('mã định danh');
    expect(message.html).toMatch(/<strong[^>]*>\s*[^<]*sv2026001[^<]*<\/strong>/);
  });

  it.each([
    'password_reset',
    'email_change',
    'password_changed',
    'email_changed_notice',
  ] as MailKind[])(
    'T-15c: thư %s không có thẻ thông tin (không lặp tên đăng nhập)',
    async (kind) => {
      const { message } = await build(kind);
      expect(message.text).not.toMatch(/^Họ tên:/m);
      expect(message.text).not.toContain('sv2026001');
    },
  );
});

describe.each(NOTICE_KINDS)('thư thông báo loại %s', (kind) => {
  it('không có liên kết nào (tránh giả mạo), có dòng liên hệ hỗ trợ', async () => {
    const { message } = await build(kind);
    expect(links(message.text)).toEqual([]);
    expect(message.html).not.toMatch(/<a\s/i);
    expect(message.text).toContain(BRAND.supportContact);
  });
});

describe('thư "mật khẩu đã đổi" (password_changed)', () => {
  it('T-09: ghi giờ Việt Nam, trình duyệt và hệ điều hành; KHÔNG ghi địa chỉ IP; không chứa mật khẩu', async () => {
    const polluted = { ip: '203.0.113.7', password: 'mat-khau-moi-123', ...content() };
    const message = renderMail('password_changed', polluted, BRAND);
    expect(message.text).toContain('20:05 ngày 12/11/2026');
    expect(message.text).toContain('Chrome 130');
    expect(message.text).toContain('Windows 11');
    for (const forbidden of ['203.0.113.7', 'mat-khau-moi-123']) {
      expect(message.text).not.toContain(forbidden);
      expect(message.html).not.toContain(forbidden);
    }
  });
});

describe('nội dung riêng cho từng người nhận', () => {
  it('T-10: hai thư cùng loại cho hai người không giống hệt nhau', () => {
    const an = renderMail(
      'activation',
      content({ fullName: 'Nguyễn Văn An', username: 'sv1' }),
      BRAND,
    );
    const binh = renderMail(
      'activation',
      content({ fullName: 'Lê Thị Bình', username: 'sv2' }),
      BRAND,
    );
    expect(an.text).not.toBe(binh.text);
    expect(an.html).not.toBe(binh.html);
  });
});

describe('an toàn nội dung', () => {
  it('T-12: họ tên và các trường văn bản được thoát ký tự HTML, không chèn được thẻ vào thư', () => {
    const hostile = '<script>alert(1)</script> "&\'';
    const message = renderMail(
      'activation',
      content({ fullName: hostile, requesterName: hostile, username: hostile }),
      BRAND,
    );
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.text).toContain(hostile); // bản thuần giữ nguyên chữ
  });

  it('tiêu đề không chứa xuống dòng dù họ tên có (chống chèn đầu mục thư)', () => {
    const message = renderMail(
      'activation',
      content({ fullName: 'An\r\nBcc: ke-xau@example.com' }),
      {
        ...BRAND,
        systemName: 'Hệ thống\r\nBcc: x@example.com',
        shortName: 'Ngắn\r\nBcc: y@example.com',
      },
    );
    expect(message.subject).not.toMatch(/[\r\n]/);
  });
});
