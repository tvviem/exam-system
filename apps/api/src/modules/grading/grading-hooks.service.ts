import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, inArray, ne } from 'drizzle-orm';
import type { AttemptGradeGuard, AttemptSubmittedHooks } from '../../common/attempt-grading';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import type { Transaction } from '../../db/db.module';
import { JOB_QUEUE, type JobQueue } from '../../queue/job-queue';
import { attemptGrades, responseGrades } from './grading.schema';
import { GradingStatusService } from './grading-status.service';

/** Số Lượt mỗi job chấm. */
const JOB_SIZE = 50;

/**
 * Hai cổng `grading` cài đặt cho `attempt` (nối ở `AttemptPortsWiringModule`): báo Lượt vừa nộp để chấm ở nền (Q286) và
 * trả lời "Lượt đã được chấm tay chưa" cho Hoàn tác Buộc nộp (Q296).
 */
@Injectable()
export class GradingHooksService implements AttemptSubmittedHooks, AttemptGradeGuard {
  private readonly logger = new Logger(GradingHooksService.name);

  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    private readonly status: GradingStatusService,
  ) {}

  async onSubmitted(attemptIds: string[]): Promise<void> {
    try {
      for (let i = 0; i < attemptIds.length; i += JOB_SIZE) {
        await this.queue.enqueue('grading.autograde', {
          attemptIds: attemptIds.slice(i, i + JOB_SIZE),
        });
      }
    } catch (error) {
      // Mất hàng đợi chỉ làm trễ: job quét vẫn bắt các Lượt này.
      this.logger.warn(`Không xếp được job chấm: ${String(error)}`);
    }
  }

  async manuallyGradedIds(tx: Transaction, attemptIds: string[]): Promise<Set<string>> {
    if (attemptIds.length === 0) return new Set();
    const rows = await tx
      .selectDistinct({ id: responseGrades.attemptId })
      .from(responseGrades)
      .where(and(inArray(responseGrades.attemptId, attemptIds), ne(responseGrades.source, 'auto')));
    const graded = new Set(rows.map((row) => row.id));
    // Phiên thi đã Công bố thì mọi Lượt coi như đã chấm: không Hoàn tác được nữa (Q296).
    const sessionOf = await this.source.sessionIdsOf(attemptIds, tx);
    const released = await this.status.releaseStates([...new Set(sessionOf.values())], tx);
    for (const [attemptId, sessionId] of sessionOf) {
      if (released.has(sessionId)) graded.add(attemptId);
    }
    return graded;
  }

  async discard(tx: Transaction, attemptIds: string[]): Promise<void> {
    if (attemptIds.length === 0) return;
    await tx.delete(responseGrades).where(inArray(responseGrades.attemptId, attemptIds));
    await tx.delete(attemptGrades).where(inArray(attemptGrades.attemptId, attemptIds));
  }
}
