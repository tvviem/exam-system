import type { BuiltMessage, MailKind } from './mail.ports';

/** Dữ liệu riêng của từng thư; `identity` (PR 7c) điền, `mail` dựng thành thư. */
export interface MailContent {
  fullName: string;
  username?: string;
  /** Liên kết duy nhất của thư (loại có liên kết). */
  link?: string;
  /** Giờ liên kết hết hạn; thư ghi giờ cụ thể theo giờ Việt Nam, không ghi "còn N ngày". */
  expiresAt?: Date;
  /** Người đã yêu cầu gửi thư (nêu ai gửi, Q382). */
  requesterName?: string;
  /** Thư "mật khẩu đã đổi": giờ, trình duyệt, hệ điều hành. Không có IP (IP chỉ ở nhật ký). */
  changedAt?: Date;
  browser?: string;
  os?: string;
  /** Thư "email đã đổi" gửi tới địa chỉ cũ: địa chỉ mới (được che bớt). */
  newEmail?: string;
}

/** Tên hệ thống và dòng liên hệ hỗ trợ, lấy từ cấu hình. */
export interface MailBrand {
  systemName: string;
  supportContact: string;
}

const LINK_KINDS: ReadonlySet<MailKind> = new Set([
  'activation',
  'invitation',
  'password_reset',
  'email_change',
]);

const VN_OFFSET_MS = 7 * 3_600_000;

/** "14:35 ngày 18/11/2026" theo giờ Việt Nam (UTC+7 quanh năm). */
function formatVietnamTime(date: Date): string {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(shifted.getUTCHours())}:${two(shifted.getUTCMinutes())} ngày ${two(shifted.getUTCDate())}/${two(shifted.getUTCMonth() + 1)}/${shifted.getUTCFullYear()}`;
}

const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ').trim();

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** m***@example.com: đủ để nhận ra mà không lộ cả địa chỉ. */
function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function required<T>(value: T | undefined, name: string, kind: MailKind): T {
  if (value === undefined) throw new Error(`Thư ${kind} thiếu ${name}`);
  return value;
}

type Block = { type: 'text'; text: string } | { type: 'link'; url: string };

/**
 * Dựng thư từ dữ liệu: bản văn bản thuần và HTML cùng nội dung (cùng danh sách khối). Mọi trường văn bản được thoát
 * ký tự HTML; tiêu đề một dòng (chống chèn đầu mục thư).
 */
export function renderMail(kind: MailKind, content: MailContent, brand: MailBrand): BuiltMessage {
  const system = oneLine(brand.systemName);
  const blocks: Block[] = [{ type: 'text', text: `Chào ${content.fullName},` }];
  const say = (text: string) => blocks.push({ type: 'text', text });
  let subject: string;

  if (LINK_KINDS.has(kind)) {
    const link = required(content.link, 'link', kind);
    const expiresAt = required(content.expiresAt, 'expiresAt', kind);
    switch (kind) {
      case 'activation':
        subject = `Kích hoạt tài khoản ${system}`;
        say(`Một tài khoản đã được tạo cho bạn trên ${brand.systemName}.`);
        if (content.username) say(`Tên đăng nhập của bạn: ${content.username}`);
        say('Hãy mở liên kết dưới đây để đặt mật khẩu và kích hoạt tài khoản:');
        break;
      case 'invitation':
        subject = `Lời mời tham gia ${system}`;
        say(`Bạn được mời tham gia ${brand.systemName} với vai trò Người ra đề.`);
        if (content.username) say(`Tên đăng nhập của bạn: ${content.username}`);
        say('Hãy mở liên kết dưới đây để đặt mật khẩu và bắt đầu:');
        break;
      case 'password_reset':
        subject = `Đặt lại mật khẩu ${system}`;
        say('Chúng tôi nhận được yêu cầu đặt lại mật khẩu tài khoản của bạn.');
        say('Nếu bạn không yêu cầu, hãy bỏ qua thư này: mật khẩu hiện tại vẫn giữ nguyên.');
        say('Để đặt mật khẩu mới, hãy mở liên kết dưới đây:');
        break;
      default:
        subject = `Xác nhận địa chỉ email mới cho ${system}`;
        say(`Địa chỉ email này vừa được đăng ký cho tài khoản của bạn trên ${brand.systemName}.`);
        say('Hãy mở liên kết dưới đây để xác nhận:');
    }
    blocks.push({ type: 'link', url: link });
    say(
      `Liên kết có hiệu lực đến ${formatVietnamTime(expiresAt)}. Không chia sẻ liên kết này với bất kỳ ai.`,
    );
    if (content.requesterName) say(`Thư này được gửi theo yêu cầu của ${content.requesterName}.`);
    if (kind === 'activation') {
      say(
        'Không thấy thư ở hộp thư đến? Hãy kiểm tra mục Spam hoặc Quảng cáo (Promotions) và thêm địa chỉ gửi vào danh bạ.',
      );
    }
  } else if (kind === 'password_changed') {
    const changedAt = required(content.changedAt, 'changedAt', kind);
    subject = `Mật khẩu ${system} của bạn đã được đổi`;
    const device = [content.browser, content.os].filter(Boolean).join(', ');
    say(
      `Mật khẩu tài khoản của bạn trên ${brand.systemName} vừa được đổi lúc ${formatVietnamTime(changedAt)}${device ? `, trên ${device}` : ''}.`,
    );
    say(
      'Nếu đó là bạn, không cần làm gì thêm. Nếu không phải bạn, hãy liên hệ ngay để được hỗ trợ.',
    );
  } else {
    subject = `Địa chỉ email của tài khoản ${system} đã được đổi`;
    say(
      `Địa chỉ email của tài khoản của bạn trên ${brand.systemName} vừa được đổi${content.newEmail ? ` sang ${maskEmail(content.newEmail)}` : ''}.`,
    );
    say(
      'Nếu đó là bạn, không cần làm gì thêm. Nếu không phải bạn, hãy liên hệ ngay để được hỗ trợ.',
    );
  }
  say(brand.supportContact);

  const text = blocks.map((b) => (b.type === 'link' ? b.url : b.text)).join('\n\n');
  const body = blocks
    .map((b) =>
      b.type === 'link'
        ? `<p><a href="${escapeHtml(b.url)}">${escapeHtml(b.url)}</a></p>`
        : `<p>${escapeHtml(b.text)}</p>`,
    )
    .join('\n');
  const html = `<!doctype html>\n<html lang="vi"><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937">\n${body}\n</body></html>`;
  return { subject: oneLine(subject), text, html };
}

/** Thư thử (lệnh `mail-test`): không liên kết, không mã; chỉ để thấy cấu hình gửi thư hoạt động. */
export function renderTestMail(brand: MailBrand, now: Date): BuiltMessage {
  const system = oneLine(brand.systemName);
  const lines = [
    `Đây là thư thử từ ${brand.systemName}, gửi lúc ${formatVietnamTime(now)}.`,
    'Nếu bạn nhận được thư này ở hộp thư đến thì cấu hình gửi thư đang hoạt động. Nếu thư nằm ở Spam, hãy bấm "Không phải thư rác" để các thư sau vào hộp thư đến.',
    brand.supportContact,
  ];
  return {
    subject: `Thư thử của ${system}`,
    text: lines.join('\n\n'),
    html: `<!doctype html>\n<html lang="vi"><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937">\n${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n')}\n</body></html>`,
  };
}
