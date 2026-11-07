import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import { type Database, DB } from '../../db/db.module';
import { JobRegistry } from '../../queue/job-queue';
import { AppealFinalizeService } from './appeal-finalize.service';
import { AutogradeService } from './autograde.service';
import { attemptGrades } from './grading.schema';

// Mỗi 5 giây (Q286, đề xuất của PR 5a): lưới an toàn cho Lượt nộp mà tin báo chưa tới (Khóa tài khoản, job bị mất, Redis hỏng).
const EVERY_5_SECONDS = '*/5 * * * * *';
/** Job Chốt mỗi phút (Q301): kiểm hết hạn Phúc khảo và nhắc việc quá hạn (Q315). */
const EVERY_MINUTE = '0 * * * * *';
/** Lần quét nhanh chỉ nhìn Lượt vừa nộp, nên mỗi 5 giây chỉ tốn hai truy vấn nhẹ. */
const RECENT_MS = 15 * 60_000;
/** Lần quét sâu (24 giờ, phân trang) chạy thưa hơn, bắt Lượt bị bỏ sót lâu hơn 15 phút (job chết lâu). */
const DEEP_EVERY_MS = 60_000;
const DEEP_WINDOW_MS = 24 * 3_600_000;
const PAGE = 500;
const DEEP_MAX_PAGES = 20;
const SWEEP_LIMIT = 500;

@Injectable()
export class GradingJobs implements OnModuleInit {
  private readonly logger = new Logger(GradingJobs.name);
  private lastDeepAt = 0;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    private readonly autograde: AutogradeService,
    private readonly finalize: AppealFinalizeService,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('grading.autograde', ({ attemptIds }) =>
      this.autograde.gradeAttempts(attemptIds).then(() => undefined),
    );
    this.registry.register('grading.sweep', () => this.sweep().then(() => undefined), {
      cron: EVERY_5_SECONDS,
    });
    this.registry.register('grading.finalize', () => this.finalize.sweep().then(() => undefined), {
      cron: EVERY_MINUTE,
    });
  }

  /**
   * Chấm các Lượt đã nộp mà chưa có dấu "đã chấm"; trả số Lượt vừa chấm. Mỗi lần xét 15 phút gần nhất (một trang); mỗi phút một
   * lần xét sâu cả 24 giờ (tối đa 10.000 Lượt gần nhất). Lượt cũ hơn nữa được chấm bù khi Người ra đề mở bảng Kết quả (5b).
   */
  async sweep(): Promise<number> {
    const now = this.clock.now().getTime();
    const deep = now - this.lastDeepAt >= DEEP_EVERY_MS;
    if (deep) this.lastDeepAt = now;
    const since = new Date(now - (deep ? DEEP_WINDOW_MS : RECENT_MS));
    const pending: string[] = [];
    for (let page = 0; page < (deep ? DEEP_MAX_PAGES : 1) && pending.length < SWEEP_LIMIT; page++) {
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
    const graded = await this.autograde.gradeAttempts(pending.slice(0, SWEEP_LIMIT));
    if (graded > 0) this.logger.log(`Job quét đã chấm ${graded} Lượt`);
    return graded;
  }
}
