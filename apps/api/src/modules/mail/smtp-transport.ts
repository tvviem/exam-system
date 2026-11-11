import nodemailer, { type Transporter } from 'nodemailer';
import { composeMail, type SenderIdentity } from './compose-mail';
import { MailSendError, type MailTransport, type OutgoingMail } from './mail.ports';

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  timeoutMs: number;
  sender: SenderIdentity;
  /** Mặc định true (kiểm chứng chứng chỉ). Chỉ test với máy chủ giả mới đặt false. */
  tlsRejectUnauthorized?: boolean;
}

interface NodemailerError extends Error {
  code?: string;
  responseCode?: number;
  response?: string;
}

/**
 * Phân loại lỗi để hàng đợi biết xử lý thế nào (Q382):
 * - `auth`: lỗi phía chúng ta (đăng nhập, TLS, hạn mức ngày của Gmail): ngắt mạch, KHÔNG đổ lỗi cho người nhận;
 * - `permanent`: máy chủ từ chối cứng người nhận (5xx còn lại): không thử lại, đánh dấu địa chỉ;
 * - `temporary`: mạng, hết giờ, 4xx: thử lại.
 */
function classify(error: NodemailerError): MailSendError['kind'] {
  const detail = `${error.response ?? ''} ${error.message}`;
  if (error.code === 'EAUTH' || [530, 534, 535, 538].includes(error.responseCode ?? 0))
    return 'auth';
  if (/STARTTLS/i.test(detail) || error.code === 'ETLS') return 'auth';
  // Gmail báo hết hạn mức ngày bằng 550 5.4.5: lỗi của tài khoản gửi, không phải của địa chỉ nhận.
  if (/\b5\.4\.5\b/.test(detail) || /quota exceeded/i.test(detail)) return 'auth';
  const code = error.responseCode ?? 0;
  if (code >= 500 && code <= 599) return 'permanent';
  return 'temporary';
}

export class SmtpTransport implements MailTransport {
  private readonly transporter: Transporter;

  constructor(
    private readonly config: SmtpConfig,
    private readonly now: () => Date,
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      // Bắt buộc STARTTLS: nếu máy chủ không hỗ trợ thì không gửi thông tin đăng nhập.
      requireTLS: true,
      auth: { user: config.username, pass: config.password },
      connectionTimeout: config.timeoutMs,
      greetingTimeout: config.timeoutMs,
      socketTimeout: config.timeoutMs,
      tls: { rejectUnauthorized: config.tlsRejectUnauthorized ?? true },
    });
  }

  async send(mail: OutgoingMail): Promise<void> {
    const raw = await composeMail(mail, this.config.sender, this.now());
    try {
      await this.transporter.sendMail({
        envelope: { from: this.config.sender.fromEmail, to: mail.to },
        raw,
      });
    } catch (error) {
      const failure = error as NodemailerError;
      throw new MailSendError(failure.response ?? failure.message, classify(failure));
    }
  }
}
