import { Module } from '@nestjs/common';
import { AttemptPortsWiringModule } from './attempt-ports-wiring.module';
import { ClockModule } from './common/clock';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { ExamUsageWiringModule } from './exam-usage-wiring.module';
import { HealthModule } from './health/health.module';
import { PinoLoggerModule } from './logger';
import { MediaModule } from './media/media-store';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityModule } from './modules/identity/identity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { QuestionBankModule } from './modules/question-bank/question-bank.module';
import { SessionModule } from './modules/session/session.module';
import { OwnedContentWiringModule } from './owned-content-wiring.module';
import { QueueModule } from './queue/job-queue';
import { RedisModule } from './redis/redis.module';
import { SessionPortsWiringModule } from './session-ports-wiring.module';
import { SessionUsageWiringModule } from './session-usage-wiring.module';

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
    SessionModule,
    SessionUsageWiringModule,
    SessionPortsWiringModule,
    AttemptPortsWiringModule,
    HealthModule,
  ],
})
export class AppModule {}
