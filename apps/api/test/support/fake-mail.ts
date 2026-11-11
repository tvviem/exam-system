import { randomBytes } from 'node:crypto';
import type { Clock } from '../../src/common/clock';
import {
  type MailKind,
  MailSendError,
  type MailTransport,
  type MessageBuilder,
  type OutgoingMail,
} from '../../src/modules/mail/mail.ports';
import type { MailContent } from '../../src/modules/mail/mail-templates';

/** Vận chuyển giả: ghi lại mọi thư đã "gửi" (kèm giờ của đồng hồ giả); lập trình được để thất bại theo ý test. */
/** Bí mật SMTP giả mà test dùng để kiểm "không lộ bí mật". */
export const TEST_SMTP_SECRET = 'mat-khau-smtp-bi-mat-cua-test';

export class FakeMailTransport implements MailTransport {
  sent: OutgoingMail[] = [];
  /** Giờ (đồng hồ giả) của từng thư trong `sent`, cùng thứ tự. */
  sentAt: Date[] = [];

  constructor(private readonly clock: Clock) {}
  private failures = new Map<string, MailSendError[]>();
  private hangs: { afterDelivering: boolean }[] = [];
  /** Số lần gửi đã bị treo (giả lập tiến trình chết); test dựng lại ứng dụng sau bài có treo. */
  hangCount = 0;

  reset(): void {
    this.sent = [];
    this.sentAt = [];
    this.failures = new Map();
    this.hangs = [];
    this.hangCount = 0;
  }

  /** `times` lần gửi kế tiếp tới `to` (hoặc tới bất kỳ ai nếu bỏ trống) ném lỗi này. */
  failNext(
    kind: MailSendError['kind'],
    options: { to?: string; message?: string; times?: number } = {},
  ): void {
    const key = options.to ?? '*';
    const list = this.failures.get(key) ?? [];
    for (let i = 0; i < (options.times ?? 1); i++) {
      list.push(new MailSendError(options.message ?? 'lỗi giả lập', kind));
    }
    this.failures.set(key, list);
  }

  /**
   * Lần gửi kế tiếp treo mãi, như thể tiến trình chết giữa chừng. `afterDelivering`: máy chủ thư đã nhận thư (thư
   * có trong `sent`) rồi mới chết, nên người nhận sẽ có thư dù hệ thống chưa kịp ghi "đã gửi".
   */
  hangNext(options: { afterDelivering: boolean }): void {
    this.hangs.push(options);
  }

  async send(mail: OutgoingMail): Promise<void> {
    const hang = this.hangs.shift();
    if (hang) {
      this.hangCount++;
      if (hang.afterDelivering) {
        this.sent.push(mail);
        this.sentAt.push(this.clock.now());
      }
      return new Promise<void>(() => {});
    }
    const failure = this.failures.get(mail.to)?.shift() ?? this.failures.get('*')?.shift();
    if (failure) throw failure;
    this.sent.push(mail);
    this.sentAt.push(this.clock.now());
  }
}

/**
 * Bộ dựng giả, đóng vai `identity` ở PR 7c: mỗi lần dựng "sinh" một mã mới (43 ký tự như mã thật) và coi mã cũ cùng
 * người nhận là hết hiệu lực (Q381). Ghi lại mọi lần được gọi để test kiểm "mã chỉ sinh lúc gửi".
 */
export class FakeMessageBuilder implements MessageBuilder {
  calls: { kind: MailKind; toEmail: string; userId: string | null }[] = [];
  /** Mọi mã đã sinh, theo thứ tự. */
  issued: string[] = [];
  private activeByRecipient = new Map<string, string>();
  private failuresLeft = 0;
  private failureMessage = '';

  reset(): void {
    this.calls = [];
    this.issued = [];
    this.activeByRecipient = new Map();
    this.failuresLeft = 0;
  }

  /** `times` lần dựng kế tiếp ném lỗi (như thể không tìm thấy người dùng). */
  failNext(times: number, message: string): void {
    this.failuresLeft = times;
    this.failureMessage = message;
  }

  async build(request: {
    kind: MailKind;
    toEmail: string;
    userId: string | null;
  }): Promise<MailContent> {
    this.calls.push(request);
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      throw new Error(this.failureMessage);
    }
    const code = randomBytes(32).toString('base64url');
    this.issued.push(code);
    this.activeByRecipient.set(request.toEmail, code);
    return {
      fullName: `Người nhận ${request.toEmail}`,
      link: `https://exam.example.edu.vn/lien-ket#${code}`,
      expiresAt: new Date('2026-12-31T00:00:00Z'),
      changedAt: new Date('2026-12-30T00:00:00Z'),
    };
  }

  isActive(code: string): boolean {
    return [...this.activeByRecipient.values()].includes(code);
  }
}
