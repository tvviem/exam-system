import { type DynamicModule, Module } from '@nestjs/common';
import { type Clock, ClockModule } from '../common/clock';
import { ConfigModule } from '../config/config.module';
import { DbModule } from '../db/db.module';
import { MediaModule } from '../media/media-store';
import { IdentityModule } from '../modules/identity/identity.module';
import { OwnedContentWiringModule } from '../owned-content-wiring.module';
import { QueueModule } from '../queue/job-queue';
import { RedisModule } from '../redis/redis.module';

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
        MediaModule,
        QueueModule,
        IdentityModule,
        OwnedContentWiringModule,
      ],
    };
  }
}
