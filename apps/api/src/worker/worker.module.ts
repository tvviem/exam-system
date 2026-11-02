import { Module } from '@nestjs/common';
import { ClockModule } from '../common/clock';
import { ConfigModule } from '../config/config.module';
import { DbModule } from '../db/db.module';
import { ExamUsageWiringModule } from '../exam-usage-wiring.module';
import { PinoLoggerModule } from '../logger';
import { MediaModule } from '../media/media-store';
import { AuditModule } from '../modules/audit/audit.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { QuestionBankModule } from '../modules/question-bank/question-bank.module';
import { OwnedContentWiringModule } from '../owned-content-wiring.module';
import { QueueModule } from '../queue/job-queue';
import { JobWorker } from '../queue/job-worker';
import { RedisModule } from '../redis/redis.module';
import { SessionPortsWiringModule } from '../session-ports-wiring.module';
import { SessionUsageWiringModule } from '../session-usage-wiring.module';

// Các module nghiệp vụ tự đăng ký hàm xử lý job vào JobRegistry khi khởi động; JobWorker lấy job từ BullMQ
// và gọi chúng. Thêm module có job mới thì import ở đây.
@Module({
  imports: [
    ConfigModule,
    ClockModule.forRoot(),
    PinoLoggerModule,
    DbModule,
    RedisModule,
    MediaModule,
    QueueModule,
    AuditModule,
    NotificationsModule,
    IdentityModule,
    QuestionBankModule,
    OwnedContentWiringModule,
    ExamUsageWiringModule,
    SessionUsageWiringModule,
    SessionPortsWiringModule,
  ],
  providers: [JobWorker],
})
export class WorkerModule {}
