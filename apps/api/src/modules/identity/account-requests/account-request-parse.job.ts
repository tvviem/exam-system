import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { JobRegistry } from '../../../queue/job-queue';
import { NotificationsService } from '../../notifications/notifications.service';
import { accountRequestItems, accountRequests, users } from '../identity.schema';
import { AccountRequestFileError, parseAccountRequestFile } from './account-request-file';
import { matchRows } from './account-request-matching';

const INSERT_CHUNK = 500;

/** Job "account-request.parse": đọc file đã tải lên, kiểm tra từng dòng, khớp tài khoản có sẵn (Q88–Q90). */
@Injectable()
export class AccountRequestParseJob implements OnModuleInit {
  private readonly logger = new Logger(AccountRequestParseJob.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    private readonly registry: JobRegistry,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.registry.register('account-request.parse', ({ requestId }) => this.run(requestId));
  }

  async run(requestId: string): Promise<void> {
    const [request] = await this.db
      .select()
      .from(accountRequests)
      .where(and(eq(accountRequests.id, requestId), eq(accountRequests.status, 'parsing')));
    if (!request?.uploadKey) return; // đã xử lý rồi (job chạy lại) hoặc không còn tồn tại

    try {
      const { rows } = await parseAccountRequestFile(await this.media.get(request.uploadKey));
      const matches = await matchRows(this.db, rows);
      await this.db.transaction(async (tx) => {
        const values = rows.map((row, i) => {
          const match = matches[i];
          return {
            requestId,
            rowNumber: row.rowNumber,
            fullName: row.fullName,
            code: row.code,
            email: row.email,
            classLabel: row.classLabel,
            dateOfBirth: row.dateOfBirth,
            gender: row.gender,
            matchStatus: match?.matchStatus ?? 'blocked',
            outcome:
              match?.matchStatus === 'blocked' ? ('rejected' as const) : ('pending' as const),
            userId: match?.userId ?? null,
            outcomeNote: match?.note ?? null,
          };
        });
        for (let i = 0; i < values.length; i += INSERT_CHUNK) {
          await tx.insert(accountRequestItems).values(values.slice(i, i + INSERT_CHUNK));
        }
        await tx
          .update(accountRequests)
          .set({ status: 'pending', rowCount: rows.length, uploadKey: null })
          .where(eq(accountRequests.id, requestId));
        const [requester] = await tx
          .select({ fullName: users.fullName })
          .from(users)
          .where(eq(users.id, request.requestedBy));
        const admins = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.isAdmin, true), isNull(users.removedAt)));
        await this.notifications.notify(
          {
            userIds: admins.map((a) => a.id),
            type: 'account_request.submitted',
            data: {
              requestId,
              requesterName: requester?.fullName ?? null,
              rowCount: rows.length,
            },
          },
          tx,
        );
      });
    } catch (error) {
      const code = error instanceof AccountRequestFileError ? error.code : 'internal_error';
      if (code === 'internal_error') this.logger.error(`Phân tích yêu cầu ${requestId} lỗi`, error);
      await this.failParse(request.requestedBy, requestId, code);
    } finally {
      await this.media.delete(request.uploadKey);
    }
  }

  private async failParse(requesterId: string, requestId: string, error: string) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(accountRequests)
        .set({ status: 'parse_failed', parseError: error, uploadKey: null })
        .where(eq(accountRequests.id, requestId));
      await this.notifications.notify(
        {
          userIds: [requesterId],
          type: 'account_request.parse_failed',
          data: { requestId, error },
        },
        tx,
      );
    });
  }
}
