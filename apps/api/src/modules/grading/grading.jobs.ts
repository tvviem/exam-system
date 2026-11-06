import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import { type Database, DB } from '../../db/db.module';
import { JobRegistry } from '../../queue/job-queue';
import { AutogradeService } from './autograde.service';
import { attemptGrades } from './grading.schema';

// Mỗi 5 giây (Q286, đề xuất của PR 5a): lưới an toàn cho Lượt nộp mà tin báo chưa tới (Buộc nộp, Hủy Phiên thi, Khóa tài khoản
// báo trong giao dịch chưa commit) hoặc job bị mất.
const EVERY_5_SECONDS = '*/5 * * * * *';
const WINDOW_MS = 24 * 3_600_000;
const PAGE = 500;
const MAX_PAGES = 20;
const BATCH = 200;

@Injectable()
export class GradingJobs implements OnModuleInit {
  private readonly logger = new Logger(GradingJobs.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    private readonly autograde: AutogradeService,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('grading.autograde', ({ attemptIds }) =>
      this.autograde.gradeAttempts(attemptIds).then(() => undefined),
    );
    this.registry.register('grading.sweep', () => this.sweep().then(() => undefined), {
      cron: EVERY_5_SECONDS,
    });
  }

  /** Chấm các Lượt nộp trong 24 giờ gần nhất mà chưa có dấu "đã chấm"; trả số Lượt vừa chấm. */
  async sweep(): Promise<number> {
    const since = new Date(this.clock.now().getTime() - WINDOW_MS);
    const pending: string[] = [];
    for (let page = 0; page < MAX_PAGES && pending.length < BATCH; page++) {
      const ids = await this.source.submittedSince(since, PAGE, page * PAGE);
      if (ids.length === 0) break;
      const done = await this.db
        .select({ id: attemptGrades.attemptId })
        .from(attemptGrades)
        .where(inArray(attemptGrades.attemptId, ids));
      const doneIds = new Set(done.map((row) => row.id));
      pending.push(...ids.filter((id) => !doneIds.has(id)));
      if (ids.length < PAGE) break;
    }
    if (pending.length === 0) return 0;
    const graded = await this.autograde.gradeAttempts(pending.slice(0, BATCH));
    if (graded > 0) this.logger.log(`Job quét đã chấm ${graded} Lượt`);
    return graded;
  }
}
