import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../../common/clock';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { type Database, DB } from '../../../db/db.module';
import type { MailKind, MessageBuilder } from '../../mail/mail.ports';
import { MessageBuilderRegistry } from '../../mail/mail.ports';
import type { MailContent } from '../../mail/mail-templates';
import { invitations, users } from '../identity.schema';
import { generateInvitationToken } from '../invitations/invitation-token';
import { AuthLinks, type LinkPurpose } from './auth-links.service';

/** Loại thư mang liên kết và trang mà liên kết dẫn tới (mã nằm ở mảnh `#`, không bao giờ gửi lên máy chủ). */
/** Hạn Lời mời: 7 ngày tính từ lúc thư được gửi đi thật (Q374). */
const INVITATION_TTL_MS = 7 * 24 * 3_600_000;

const LINKS: Partial<Record<MailKind, { purpose: LinkPurpose; path: string }>> = {
  activation: { purpose: 'activation', path: '/activate' },
  password_reset: { purpose: 'password_reset', path: '/reset-password' },
  email_change: { purpose: 'email_change', path: '/verify-email' },
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
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly links: AuthLinks,
    private readonly registry: MessageBuilderRegistry,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async build(request: Parameters<MessageBuilder['build']>[0]): Promise<MailContent> {
    if (request.kind === 'invitation') return this.buildInvitation(request.context);
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

    if (request.kind === 'email_changed_notice') content.newEmail = request.context?.newEmail;

    const spec = LINKS[request.kind];
    if (spec) {
      // Thư đổi email gửi tới địa chỉ MỚI: địa chỉ nhận chính là email sẽ được áp dụng khi bấm liên kết.
      const { token, expiresAt } = await this.links.issue(
        request.userId,
        spec.purpose,
        spec.purpose === 'email_change' ? { newEmail: request.toEmail } : {},
      );
      content.link = `${this.env.APP_ORIGINS[0]}${spec.path}#${token}`;
      content.expiresAt = expiresAt;
    }
    return content;
  }

  /**
   * Thư mời Người ra đề: sinh mã LÚC GỬI và đặt vào Lời mời (hạn 7 ngày tính từ lúc gửi); mã mới làm mã của lần thử trước mất
   * hiệu lực. Lời mời đã được nhận hoặc thu hồi thì không gửi.
   */
  private async buildInvitation(context: Record<string, string> | null): Promise<MailContent> {
    const id = context?.invitationId;
    if (!id) throw new Error('Thư mời thiếu invitationId');
    const [invitation] = await this.db
      .select({
        fullName: invitations.fullName,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        invitedBy: users.fullName,
      })
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.invitedBy))
      .where(eq(invitations.id, id));
    if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
      throw new Error('Lời mời không còn hiệu lực');
    }
    const { token, tokenHash } = generateInvitationToken();
    const expiresAt = new Date(this.clock.now().getTime() + INVITATION_TTL_MS);
    await this.db.update(invitations).set({ tokenHash, expiresAt }).where(eq(invitations.id, id));
    return {
      fullName: invitation.fullName,
      link: `${this.env.APP_ORIGINS[0]}/invite#${token}`,
      expiresAt,
      requesterName: invitation.invitedBy,
    };
  }
}
