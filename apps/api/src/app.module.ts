import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { PinoLoggerModule } from './logger';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [ConfigModule, PinoLoggerModule, DbModule, RedisModule, HealthModule],
})
export class AppModule {}
