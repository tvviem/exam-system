import { ATTEMPT_GRACE_SECONDS } from '@exam/shared';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import { type Database, DB } from '../../db/db.module';
import { JobRegistry } from '../../queue/job-queue';

const BATCH = 200;
// Mỗi 10 giây (Q212), cron 6 trường có giây.
const EVERY_10_SECONDS = '*/10 * * * * *';

/**
 * Job "attempt.sweep" (Q212, Q233): tự nộp các Lượt quá hạn cộng ân hạn. Đọc hạn từ PostgreSQL nên Cộng giờ không phải
 * đụng hàng đợi và mất Redis chỉ làm trễ. `SKIP LOCKED` nên hai bản chạy cùng lúc không giẫm lên nhau.
 */
@Injectable()
export class AttemptSweepJob implements OnModuleInit {
  private readonly logger = new Logger(AttemptSweepJob.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('attempt.sweep', () => this.run().then(() => undefined), {
      cron: EVERY_10_SECONDS,
    });
  }

  /** Nộp tối đa vài lô Lượt quá hạn; trả tổng số Lượt đã đóng. */
  async run(): Promise<number> {
    const now = this.clock.now();
    let total = 0;
    for (;;) {
      const result = await this.db.execute(sql`
        update attempts set status = 'submitted', submitted_at = ${now}, submit_reason = 'timeout'
        where id in (
          select id from attempts
          where status = 'in_progress' and deadline + make_interval(secs => ${ATTEMPT_GRACE_SECONDS}) < ${now}
          order by deadline
          limit ${BATCH}
          for update skip locked
        )
        returning id`);
      total += result.rows.length;
      if (result.rows.length < BATCH) break;
    }
    if (total > 0) this.logger.log(`Đã tự nộp ${total} Lượt làm bài hết giờ`);
    return total;
  }
}
