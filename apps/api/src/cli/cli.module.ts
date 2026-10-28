import { type DynamicModule, Module } from '@nestjs/common';
import { type Clock, ClockModule } from '../common/clock';
import { ConfigModule } from '../config/config.module';
import { DbModule } from '../db/db.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { RedisModule } from '../redis/redis.module';

@Module({})
export class CliModule {
  static create(clock?: Clock): DynamicModule {
    return {
      module: CliModule,
      imports: [ConfigModule, ClockModule.forRoot(clock), DbModule, RedisModule, IdentityModule],
    };
  }
}
