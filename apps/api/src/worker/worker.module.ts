import { Module } from '@nestjs/common';
import { ClockModule } from '../common/clock';
import { ConfigModule } from '../config/config.module';
import { DbModule } from '../db/db.module';
import { PinoLoggerModule } from '../logger';
import { MediaModule } from '../media/media-store';
import { AuditModule } from '../modules/audit/audit.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { QueueModule } from '../queue/job-queue';
import { JobWorker } from '../queue/job-worker';
import { RedisModule } from '../redis/redis.module';

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
  ],
  providers: [JobWorker],
})
export class WorkerModule {}
