import type { mailKindEnum } from './mail.schema';
import type { MailContent } from './mail-templates';

export type MailKind = (typeof mailKindEnum.enumValues)[number];

/** Thư đã dựng xong (từ mẫu thư), sẵn sàng gửi. */
export interface BuiltMessage {
  subject: string;
  text: string;
  html: string;
}

export interface OutgoingMail extends BuiltMessage {
  to: string;
}

/** Adapter vận chuyển (SMTP thật, bản giả cho test). Ném lỗi nếu máy chủ thư không nhận. */
/** Giá trị `null` là chế độ "không gửi": chưa cấu hình SMTP trên production (thư được đánh dấu bỏ qua). */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
export interface MailTransport {
  send(mail: OutgoingMail): Promise<void>;
}

/**
 * Chuẩn bị dữ liệu cho thư lúc gửi; `identity` cài đặt ở PR 7c (sinh mã và liên kết tại đây, Q381). `mail` giữ mẫu
 * thư và MIME, nên bộ dựng chỉ trả dữ liệu (họ tên, liên kết, hạn), không biết cấu hình gửi thư.
 */
export const MESSAGE_BUILDER = Symbol('MESSAGE_BUILDER');
export interface MessageBuilder {
  build(request: {
    kind: MailKind;
    toEmail: string;
    userId: string | null;
    requestedBy: string | null;
    context: Record<string, string> | null;
  }): Promise<MailContent>;
}

/** Phân loại lỗi gửi: `temporary` thử lại, `permanent` địa chỉ bị từ chối, `auth` lỗi cấu hình (ngắt mạch). */
export class MailSendError extends Error {
  constructor(
    message: string,
    readonly kind: 'temporary' | 'permanent' | 'auth',
  ) {
    super(message);
    this.name = 'MailSendError';
  }
}

/** Chờ `ms` mili giây giữa hai thư; production chờ thật, test tua đồng hồ giả. */
export const MAIL_PAUSE = Symbol('MAIL_PAUSE');
export type MailPause = (ms: number) => Promise<void>;

/** Các bí mật (mật khẩu SMTP) phải che khỏi mọi thông báo lỗi trước khi ghi lại. */
export const MAIL_SECRETS = Symbol('MAIL_SECRETS');

/** Tên hệ thống và dòng liên hệ hỗ trợ đưa vào mẫu thư. */
export const MAIL_BRAND = Symbol('MAIL_BRAND');

/**
 * `MESSAGE_BUILDER` thật của ứng dụng: bộ đăng ký để `identity` (bên cài đặt) tự đăng ký lúc khởi động. Nhờ vậy `mail`
 * không phải import `identity` (không vòng phụ thuộc, không phạm architecture.test A1).
 */
export class MessageBuilderRegistry implements MessageBuilder {
  private builder: MessageBuilder | null = null;

  register(builder: MessageBuilder): void {
    this.builder = builder;
  }

  async build(request: Parameters<MessageBuilder['build']>[0]): Promise<MailContent> {
    if (!this.builder) throw new Error('Chưa có bộ dựng thư nào được đăng ký');
    return this.builder.build(request);
  }
}
