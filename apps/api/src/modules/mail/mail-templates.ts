import type { BuiltMessage, MailKind } from './mail.ports';

/** Dữ liệu riêng của từng thư; `identity` (PR 7c) điền, `mail` dựng thành thư. */
export interface MailContent {
  fullName: string;
  username?: string;
  /** Mã định danh của người nhận (nếu có): để biết tên đăng nhập có đúng là mã hay không. */
  code?: string | null;
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

/**
 * Tên hệ thống và dòng liên hệ hỗ trợ, lấy từ cấu hình. `systemName` là tên đầy đủ (đầu thư và thân thư);
 * `shortName` là tên ngắn dùng ở tiêu đề (tiêu đề dài bị cắt trên điện thoại và dễ bị lọc rác).
 */
export interface MailBrand {
  systemName: string;
  shortName: string;
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

/** Một đoạn chữ: chuỗi thường hoặc đoạn in đậm (HTML dùng <strong>, bản thuần giữ nguyên chữ). */
type Part = string | { strong: string };
type Block =
  | { type: 'heading'; text: string }
  | { type: 'text'; parts: Part[] }
  | { type: 'card'; rows: { label: string; value: string; mono?: boolean }[] }
  | { type: 'link'; url: string };

const INK = '#1f2937';
const ACCENT = '#1d4ed8';

const partsText = (parts: Part[]) =>
  parts.map((p) => (typeof p === 'string' ? p : p.strong)).join('');
const partsHtml = (parts: Part[]) =>
  parts
    .map((p) =>
      typeof p === 'string' ? escapeHtml(p) : `<strong>${escapeHtml(p.strong)}</strong>`,
    )
    .join('');

type BlockOf<K extends Block['type']> = Extract<Block, { type: K }>;

/**
 * Mỗi loại khối khai báo CẢ HAI cách trình bày (bản thuần và HTML) ở một chỗ, nên thêm một loại khối chỉ sửa một nơi và
 * hai bản không thể lệch nhau về nội dung.
 */
const RENDERERS: {
  [K in Block['type']]: { text(b: BlockOf<K>): string; html(b: BlockOf<K>): string };
} = {
  heading: {
    text: (b) => b.text,
    html: (b) =>
      `<div style="margin:0 0 16px;padding-bottom:8px;border-bottom:3px solid ${ACCENT};font-size:18px;font-weight:700;color:#1e3a8a">${escapeHtml(b.text)}</div>`,
  },
  text: {
    text: (b) => partsText(b.parts),
    html: (b) => `<p style="margin:0 0 16px">${partsHtml(b.parts)}</p>`,
  },
  card: {
    text: (b) => b.rows.map((r) => `${r.label}: ${r.value}`).join('\n'),
    // Viền và chữ đậm (không chỉ dựa vào màu nền: nhiều ứng dụng thư đảo màu ở chế độ tối).
    html: (b) => {
      const rows = b.rows
        .map(
          (r) =>
            `<div style="margin:0 0 4px;font-size:14px;color:#475569">${escapeHtml(r.label)}</div><div style="margin:0 0 12px"><strong style="font-size:18px;color:#0f172a${r.mono ? ";font-family:Consolas,Menlo,'Courier New',monospace" : ''}">${escapeHtml(r.value)}</strong></div>`,
        )
        .join('');
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;border:1px solid #94a3b8;border-radius:8px;background:#f8fafc"><tr><td style="padding:12px 16px 0">${rows}</td></tr></table>`;
    },
  },
  // Vẫn MỘT liên kết duy nhất, chữ hiển thị trùng đích (chống giả mạo, Q382), nhưng trình bày nổi bật.
  link: {
    text: (b) => b.url,
    html: (b) =>
      `<p style="margin:0 0 16px"><a href="${escapeHtml(b.url)}" style="display:inline-block;padding:10px 14px;border:2px solid ${ACCENT};border-radius:8px;font-weight:700;color:${ACCENT};text-decoration:underline;word-break:break-all">${escapeHtml(b.url)}</a></p>`,
  },
};

const renderBlock = (b: Block, as: 'text' | 'html'): string =>
  (RENDERERS[b.type][as] as (block: Block) => string)(b);

/**
 * Dựng thư từ dữ liệu: bản văn bản thuần và HTML cùng nội dung (cùng danh sách khối). Mọi trường văn bản được thoát
 * ký tự HTML; tiêu đề một dòng (chống chèn đầu mục thư). Đầu thư ghi tên hệ thống đầy đủ; thư kích hoạt và lời mời có thẻ
 * thông tin (Họ tên, Tên đăng nhập) và giờ hết hạn in đậm.
 */
export function renderMail(kind: MailKind, content: MailContent, brand: MailBrand): BuiltMessage {
  const short = oneLine(brand.shortName);
  const blocks: Block[] = [
    { type: 'heading', text: brand.systemName },
    { type: 'text', parts: [`Chào ${content.fullName},`] },
  ];
  const say = (...parts: Part[]) => blocks.push({ type: 'text', parts });
  let subject: string;

  /** Thẻ thông tin tài khoản; thư kích hoạt ghi "(mã định danh)" chỉ khi tên đăng nhập đúng là mã của người đó. */
  const accountCard = (usernameLabel: string) => {
    const rows: { label: string; value: string; mono?: boolean }[] = [
      { label: 'Họ tên', value: content.fullName },
    ];
    if (content.username) rows.push({ label: usernameLabel, value: content.username, mono: true });
    blocks.push({ type: 'card', rows });
  };

  if (LINK_KINDS.has(kind)) {
    const link = required(content.link, 'link', kind);
    const expiresAt = required(content.expiresAt, 'expiresAt', kind);
    switch (kind) {
      case 'activation':
        subject = `Kích hoạt tài khoản ${short}`;
        say(`Một tài khoản đã được tạo cho bạn trên ${brand.systemName}.`);
        accountCard(
          content.code && content.username?.toLowerCase() === content.code.toLowerCase()
            ? 'Tên đăng nhập (mã định danh)'
            : 'Tên đăng nhập',
        );
        say({ strong: 'Hãy mở liên kết dưới đây để đặt mật khẩu và kích hoạt tài khoản:' });
        break;
      case 'invitation':
        subject = `Lời mời tham gia ${short}`;
        say(`Bạn được mời tham gia ${brand.systemName} với vai trò Người ra đề.`);
        accountCard('Tên đăng nhập');
        say({ strong: 'Hãy mở liên kết dưới đây để đặt mật khẩu và bắt đầu:' });
        break;
      case 'password_reset':
        subject = `Đặt lại mật khẩu ${short}`;
        say('Chúng tôi nhận được yêu cầu đặt lại mật khẩu tài khoản của bạn.');
        say('Nếu bạn không yêu cầu, hãy bỏ qua thư này: mật khẩu hiện tại vẫn giữ nguyên.');
        say({ strong: 'Để đặt mật khẩu mới, hãy mở liên kết dưới đây:' });
        break;
      default:
        subject = `Xác nhận địa chỉ email mới cho ${short}`;
        say(`Địa chỉ email này vừa được đăng ký cho tài khoản của bạn trên ${brand.systemName}.`);
        say({ strong: 'Hãy mở liên kết dưới đây để xác nhận:' });
    }
    blocks.push({ type: 'link', url: link });
    say(
      'Liên kết có hiệu lực đến ',
      { strong: formatVietnamTime(expiresAt) },
      '. Không chia sẻ liên kết này với bất kỳ ai.',
    );
    if (content.requesterName) say(`Thư này được gửi theo yêu cầu của ${content.requesterName}.`);
    if (kind === 'activation') {
      say(
        'Không thấy thư ở hộp thư đến? Hãy kiểm tra mục Spam hoặc Quảng cáo (Promotions) và thêm địa chỉ gửi vào danh bạ.',
      );
    }
  } else if (kind === 'password_changed') {
    const changedAt = required(content.changedAt, 'changedAt', kind);
    subject = `Mật khẩu ${short} của bạn đã được đổi`;
    const device = [content.browser, content.os].filter(Boolean).join(', ');
    say(
      `Mật khẩu tài khoản của bạn trên ${brand.systemName} vừa được đổi lúc ${formatVietnamTime(changedAt)}${device ? `, trên ${device}` : ''}.`,
    );
    say(
      'Nếu đó là bạn, không cần làm gì thêm. Nếu không phải bạn, hãy liên hệ ngay để được hỗ trợ.',
    );
  } else {
    subject = `Địa chỉ email của tài khoản ${short} đã được đổi`;
    say(
      `Địa chỉ email của tài khoản của bạn trên ${brand.systemName} vừa được đổi${content.newEmail ? ` sang ${maskEmail(content.newEmail)}` : ''}.`,
    );
    say(
      'Nếu đó là bạn, không cần làm gì thêm. Nếu không phải bạn, hãy liên hệ ngay để được hỗ trợ.',
    );
  }
  say(brand.supportContact);

  const text = blocks.map((b) => renderBlock(b, 'text')).join('\n\n');
  const body = blocks.map((b) => renderBlock(b, 'html')).join('\n');
  const html = `<!doctype html>\n<html lang="vi"><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:${INK}">\n<div style="max-width:600px">\n${body}\n</div>\n</body></html>`;
  return { subject: oneLine(subject), text, html };
}

/** Thư thử (lệnh `mail-test`): không liên kết, không mã; chỉ để thấy cấu hình gửi thư hoạt động. */
export function renderTestMail(brand: MailBrand, now: Date): BuiltMessage {
  const system = oneLine(brand.shortName);
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
