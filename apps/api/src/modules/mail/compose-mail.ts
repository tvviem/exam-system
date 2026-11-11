import { randomUUID } from 'node:crypto';
import MailComposer from 'nodemailer/lib/mail-composer';
import type { OutgoingMail } from './mail.ports';

/** Danh tính người gửi (từ cấu hình): một tên hiển thị và một địa chỉ không đổi (Q382). */
export interface SenderIdentity {
  fromName: string;
  fromEmail: string;
  replyTo: string;
}

/**
 * Dựng thư thành văn bản MIME hoàn chỉnh: đủ đầu mục chuẩn (`Date`, `Message-ID` mang tên miền người gửi,
 * `MIME-Version`, `Auto-Submitted`), `multipart/alternative` gồm văn bản thuần và HTML, UTF-8. Không đặt
 * `List-Unsubscribe` (thư giao dịch, Q382). Dựng tách khỏi việc gửi để kiểm thử được mà không cần máy chủ thư.
 */
export async function composeMail(
  mail: OutgoingMail,
  sender: SenderIdentity,
  now: Date,
): Promise<Buffer> {
  const domain = sender.fromEmail.split('@')[1] as string;
  const composer = new MailComposer({
    from: { name: sender.fromName, address: sender.fromEmail },
    replyTo: sender.replyTo,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    date: now,
    messageId: `<${randomUUID()}@${domain}>`,
    headers: { 'Auto-Submitted': 'auto-generated' },
  });
  return composer.compile().build();
}
