import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { DbModule } from '../db/db.module';
import { PinoLoggerModule } from '../logger';
import { RedisModule } from '../redis/redis.module';

// Hàng đợi BullMQ (tự Nộp bài, xử lý ảnh, Excel, email, Chốt kết quả) được đăng ký ở đây từ lát cắt 2.
@Module({
  imports: [ConfigModule, PinoLoggerModule, DbModule, RedisModule],
})
export class WorkerModule {}
