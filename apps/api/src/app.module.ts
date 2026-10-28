import { Module } from '@nestjs/common';
import { ClockModule } from './common/clock';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { PinoLoggerModule } from './logger';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityModule } from './modules/identity/identity.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    ClockModule.forRoot(),
    PinoLoggerModule,
    DbModule,
    RedisModule,
    AuditModule,
    IdentityModule,
    HealthModule,
  ],
})
export class AppModule {}
