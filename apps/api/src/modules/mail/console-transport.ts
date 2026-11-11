import type { MailTransport, OutgoingMail } from './mail.ports';

/**
 * Adapter in thư ra bảng điều khiển để thử luồng bằng tay ở dev. Thư chứa liên kết có mã nên
 * `selectMailTransport` KHÔNG BAO GIỜ chọn adapter này ở production.
 */
export class ConsoleTransport implements MailTransport {
  constructor(private readonly write: (text: string) => void) {}

  async send(mail: OutgoingMail): Promise<void> {
    this.write(
      `--- THƯ (chỉ dev) ---\nĐến: ${mail.to}\nTiêu đề: ${mail.subject}\n\n${mail.text}\n---------------------`,
    );
  }
}
