import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { JobRegistry } from '../../../queue/job-queue';
import { NotificationsService } from '../../notifications/notifications.service';
import { accountRequests, credentialSlips, loginEvents } from '../identity.schema';

const LOGIN_EVENT_RETENTION_MONTHS = 12;
const PARSING_TIMEOUT_MS = 15 * 60_000;
// Mỗi ngày lúc 3 giờ sáng.
const DAILY_CRON = '0 3 * * *';

/** Job "maintenance.cleanup" hằng ngày (Q96). */
@Injectable()
export class IdentityMaintenanceJob implements OnModuleInit {
  private readonly logger = new Logger(IdentityMaintenanceJob.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    private readonly registry: JobRegistry,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.registry.register('maintenance.cleanup', () => this.run(), { cron: DAILY_CRON });
  }

  /** Mỗi bước độc lập: một bước lỗi chỉ được ghi log, các bước còn lại vẫn chạy trong ngày. */
  async run(): Promise<void> {
    const steps = [
      ['login_events', () => this.deleteOldLoginEvents()],
      ['phiếu hết hạn', () => this.expireSlips()],
      ['yêu cầu kẹt ở parsing', () => this.failStuckParsing()],
    ] as const;
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        this.logger.error(`Dọn dẹp "${name}" lỗi`, error);
      }
    }
  }

  private async deleteOldLoginEvents() {
    const cutoff = this.clock.now();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - LOGIN_EVENT_RETENTION_MONTHS);
    await this.db.delete(loginEvents).where(lt(loginEvents.at, cutoff));
  }

  /** Phiếu quá hạn: xóa file, đặt `expired`. */
  private async expireSlips() {
    const expired = await this.db
      .select()
      .from(credentialSlips)
      .where(
        and(eq(credentialSlips.status, 'ready'), lt(credentialSlips.expiresAt, this.clock.now())),
      );
    for (const slip of expired) {
      for (const key of [slip.pdfKey, slip.xlsxKey]) if (key) await this.media.delete(key);
      await this.db
        .update(credentialSlips)
        .set({ status: 'expired', pdfKey: null, xlsxKey: null })
        .where(eq(credentialSlips.id, slip.id));
    }
  }

  /** Worker chết giữa lúc đọc file thì yêu cầu kẹt ở `parsing`: sau 15 phút đổi thành `parse_failed`. */
  private async failStuckParsing() {
    const cutoff = new Date(this.clock.now().getTime() - PARSING_TIMEOUT_MS);
    const stuck = await this.db
      .select()
      .from(accountRequests)
      .where(and(eq(accountRequests.status, 'parsing'), lt(accountRequests.createdAt, cutoff)));
    for (const request of stuck) {
      await this.db.transaction(async (tx) => {
        const failed = await tx
          .update(accountRequests)
          .set({ status: 'parse_failed', parseError: 'internal_error', uploadKey: null })
          .where(and(eq(accountRequests.id, request.id), eq(accountRequests.status, 'parsing')))
          .returning({ id: accountRequests.id });
        if (failed.length === 0) return;
        await this.notifications.notify(
          {
            userIds: [request.requestedBy],
            type: 'account_request.parse_failed',
            data: { requestId: request.id, error: 'internal_error' },
          },
          tx,
        );
      });
      if (request.uploadKey) await this.media.delete(request.uploadKey);
    }
  }
}
