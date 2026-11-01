import { Global, Module } from '@nestjs/common';
import { SESSION_USAGE } from './common/session-usage';
import { SessionModule } from './modules/session/session.module';
import { SessionUsageService } from './modules/session/session-usage.service';

/** Nối cổng `SESSION_USAGE` (Q204): `exam` đòi cổng, `session` cài đặt, hai module không import nhau. */
@Global()
@Module({
  imports: [SessionModule],
  providers: [{ provide: SESSION_USAGE, useExisting: SessionUsageService }],
  exports: [SESSION_USAGE],
})
export class SessionUsageWiringModule {}
