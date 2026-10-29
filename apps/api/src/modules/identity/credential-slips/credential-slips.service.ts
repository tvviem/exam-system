import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { Actor } from '../../../common/actor';
import { ApiError } from '../../../common/api-error';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { accountRequests, credentialSlips } from '../identity.schema';
import { SlipVault } from './slip-vault';

export type SlipFormat = 'pdf' | 'xlsx';

const FORMATS = {
  pdf: { contentType: 'application/pdf', key: 'pdfKey' },
  xlsx: {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    key: 'xlsxKey',
  },
} as const;

@Injectable()
export class CredentialSlipsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    private readonly vault: SlipVault,
    private readonly audit: AuditService,
  ) {}

  /** Phiếu của một yêu cầu; người ra đề chỉ thấy yêu cầu của mình. */
  async listFor(user: AuthenticatedUser, requestId: string) {
    const [request] = await this.db
      .select({ requestedBy: accountRequests.requestedBy })
      .from(accountRequests)
      .where(eq(accountRequests.id, requestId));
    if (!request || (!user.isAdmin && request.requestedBy !== user.id))
      throw new ApiError('NOT_FOUND');

    const now = this.clock.now();
    const slips = await this.db
      .select({
        id: credentialSlips.id,
        status: credentialSlips.status,
        itemCount: credentialSlips.itemCount,
        createdAt: credentialSlips.createdAt,
        expiresAt: credentialSlips.expiresAt,
      })
      .from(credentialSlips)
      .where(eq(credentialSlips.requestId, requestId))
      .orderBy(desc(credentialSlips.createdAt), desc(credentialSlips.id));
    // Quá hạn mà job dọn dẹp chưa chạy vẫn hiện là "hết hạn".
    return slips.map((s) => ({
      ...s,
      status: s.status === 'ready' && s.expiresAt <= now ? ('expired' as const) : s.status,
    }));
  }

  /** Giải mã và trả file; mỗi lần tải ghi nhật ký (Q94). */
  async download(user: AuthenticatedUser, actor: Actor, slipId: string, format: SlipFormat) {
    const [row] = await this.db
      .select({ slip: credentialSlips, requestedBy: accountRequests.requestedBy })
      .from(credentialSlips)
      .innerJoin(accountRequests, eq(accountRequests.id, credentialSlips.requestId))
      .where(eq(credentialSlips.id, slipId));
    if (!row || (!user.isAdmin && row.requestedBy !== user.id)) throw new ApiError('NOT_FOUND');

    const { slip } = row;
    if (slip.status === 'expired' || slip.expiresAt <= this.clock.now())
      throw new ApiError('SLIP_EXPIRED');
    const key = slip[FORMATS[format].key];
    if (slip.status !== 'ready' || !key) throw new ApiError('INVALID_STATE');

    const content = this.vault.decrypt(await this.media.get(key));
    await this.audit.record({
      actor,
      action: 'credential-slip.download',
      entityType: 'credential_slip',
      entityId: slip.id,
      after: { format },
    });
    // Ngày theo Clock dùng làm tên file tải về.
    const date = this.clock.now().toISOString().slice(0, 10).replaceAll('-', '');
    return { content, contentType: FORMATS[format].contentType, date };
  }
}
