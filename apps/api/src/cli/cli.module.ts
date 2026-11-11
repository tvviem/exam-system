import { type DynamicModule, Module } from '@nestjs/common';
import { AttemptPortsWiringModule } from '../attempt-ports-wiring.module';
import { type Clock, ClockModule } from '../common/clock';
import { ConfigModule } from '../config/config.module';
import { DbModule } from '../db/db.module';
import { ExamUsageWiringModule } from '../exam-usage-wiring.module';
import { MediaModule } from '../media/media-store';
import { IdentityModule } from '../modules/identity/identity.module';
import { MailModule } from '../modules/mail/mail.module';
import { RealtimeNotifierModule } from '../modules/realtime/realtime-notifier.module';
import { OwnedContentWiringModule } from '../owned-content-wiring.module';
import { QueueModule } from '../queue/job-queue';
import { RedisModule } from '../redis/redis.module';
import { SessionPortsWiringModule } from '../session-ports-wiring.module';
import { SessionUsageWiringModule } from '../session-usage-wiring.module';

@Module({})
export class CliModule {
  static create(clock?: Clock): DynamicModule {
    return {
      module: CliModule,
      // IdentityModule cần cả MediaStore, JobQueue và cổng OWNED_CONTENT dù CLI không dùng tới.
      imports: [
        ConfigModule,
        ClockModule.forRoot(clock),
        DbModule,
        RedisModule,
        RealtimeNotifierModule,
        MediaModule,
        QueueModule,
        IdentityModule,
        MailModule,
        OwnedContentWiringModule,
        ExamUsageWiringModule,
        SessionUsageWiringModule,
        SessionPortsWiringModule,
        AttemptPortsWiringModule,
      ],
    };
  }
}
