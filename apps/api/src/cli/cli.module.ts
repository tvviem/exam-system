import { type DynamicModule, Module } from '@nestjs/common';
import { type Clock, ClockModule } from '../common/clock';
import { ConfigModule } from '../config/config.module';
import { DbModule } from '../db/db.module';
import { AuditModule } from '../modules/audit/audit.module';
import { AdminAccountsService } from '../modules/identity/admin-accounts.service';
import { SessionStore } from '../modules/identity/auth/session-store';
import { RedisModule } from '../redis/redis.module';

@Module({})
export class CliModule {
  static create(clock?: Clock): DynamicModule {
    return {
      module: CliModule,
      imports: [ConfigModule, ClockModule.forRoot(clock), DbModule, RedisModule, AuditModule],
      providers: [AdminAccountsService, SessionStore],
    };
  }
}
