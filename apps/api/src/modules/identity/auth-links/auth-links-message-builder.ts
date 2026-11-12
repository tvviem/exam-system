import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { type Database, DB } from '../../../db/db.module';
import type { MailKind, MessageBuilder } from '../../mail/mail.ports';
import { MessageBuilderRegistry } from '../../mail/mail.ports';
import type { MailContent } from '../../mail/mail-templates';
import { users } from '../identity.schema';
import { AuthLinks, type LinkPurpose } from './auth-links.service';

/** Loại thư mang liên kết và trang mà liên kết dẫn tới (mã nằm ở mảnh `#`, không bao giờ gửi lên máy chủ). */
const LINKS: Partial<Record<MailKind, { purpose: LinkPurpose; path: string }>> = {
  activation: { purpose: 'activation', path: '/activate' },
  password_reset: { purpose: 'password_reset', path: '/reset-password' },
};

/**
 * Bộ dựng thư của `identity` (Q381): sinh mã LÚC GỬI, nên hàng đợi thư không bao giờ chứa mã, và phát hành mã mới
 * vô hiệu mã của lần thử trước. Liên kết dựng từ địa chỉ cấu hình cố định, không lấy từ tiêu đề `Host`.
 */
@Injectable()
export class AuthLinksMessageBuilder implements MessageBuilder, OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly links: AuthLinks,
    private readonly registry: MessageBuilderRegistry,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async build(request: Parameters<MessageBuilder['build']>[0]): Promise<MailContent> {
    if (!request.userId) throw new Error(`Thư ${request.kind} cần người dùng`);
    const [user] = await this.db
      .select({ fullName: users.fullName, username: users.username })
      .from(users)
      .where(eq(users.id, request.userId));
    if (!user) throw new Error('Không tìm thấy người dùng của thư');
    const content: MailContent = { fullName: user.fullName, username: user.username ?? undefined };

    if (request.kind === 'password_changed') {
      content.changedAt = new Date(request.context?.changedAt ?? Date.now());
      content.browser = request.context?.browser;
      content.os = request.context?.os;
    }

    const spec = LINKS[request.kind];
    if (spec) {
      const { token, expiresAt } = await this.links.issue(request.userId, spec.purpose);
      content.link = `${this.env.APP_ORIGINS[0]}${spec.path}#${token}`;
      content.expiresAt = expiresAt;
    }
    return content;
  }
}
