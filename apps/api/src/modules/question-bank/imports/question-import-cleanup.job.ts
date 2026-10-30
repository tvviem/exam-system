import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { JobRegistry } from '../../../queue/job-queue';
import { questionImportBatches } from '../question-bank.schema';

const STUCK_AFTER_MS = 15 * 60_000;
// Mỗi ngày lúc 3 giờ 15, sau job dọn của identity.
const DAILY_CRON = '15 3 * * *';

/** Job "question-import.cleanup" hằng ngày (Q146): xóa lô quá hạn, cứu lô kẹt do worker chết giữa chừng. */
@Injectable()
export class QuestionImportCleanupJob implements OnModuleInit {
  private readonly logger = new Logger(QuestionImportCleanupJob.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('question-import.cleanup', () => this.run(), { cron: DAILY_CRON });
  }

  /** Mỗi bước độc lập: một bước lỗi chỉ được ghi log, các bước còn lại vẫn chạy trong ngày. */
  async run(): Promise<void> {
    const steps = [
      ['lô kẹt ở parsing', () => this.failStuckParsing()],
      ['lô kẹt ở committing', () => this.reopenStuckCommitting()],
      ['lô hết hạn', () => this.deleteExpired()],
    ] as const;
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        this.logger.error(`Dọn dẹp "${name}" lỗi`, error);
      }
    }
  }

  private cutoff() {
    return new Date(this.clock.now().getTime() - STUCK_AFTER_MS);
  }

  /** Worker chết giữa lúc đọc file: sau 15 phút lô thành `parse_failed`, file tạm được xóa. */
  private async failStuckParsing() {
    const stuck = await this.db
      .update(questionImportBatches)
      .set({ status: 'parse_failed', parseError: 'internal_error', uploadKey: null })
      .where(
        and(
          eq(questionImportBatches.status, 'parsing'),
          lt(questionImportBatches.createdAt, this.cutoff()),
        ),
      )
      .returning({ id: questionImportBatches.id });
    // Khóa file nằm ở cột đã bị xóa trong câu trên; dựng lại từ id theo quy ước đặt tên của `create`.
    for (const { id } of stuck) await this.media.delete(`uploads/question-imports/${id}`);
  }

  /** Worker chết giữa lúc tạo Câu hỏi thì giao dịch chưa commit: lô trở lại `ready` để xác nhận lại. */
  private async reopenStuckCommitting() {
    await this.db
      .update(questionImportBatches)
      .set({ status: 'ready', commitRequestedAt: null })
      .where(
        and(
          eq(questionImportBatches.status, 'committing'),
          lt(questionImportBatches.commitRequestedAt, this.cutoff()),
        ),
      );
  }

  /** Các dòng của lô đi theo (ON DELETE CASCADE). */
  private async deleteExpired() {
    await this.db
      .delete(questionImportBatches)
      .where(lt(questionImportBatches.expiresAt, this.clock.now()));
  }
}
