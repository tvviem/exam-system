import { Global, Module } from '@nestjs/common';
import { REALTIME_NOTIFIER } from '../../common/realtime-notifier';
import { RedisRealtimeNotifier } from './redis-realtime-notifier';

/** Bộ báo cho kênh đẩy, có ở cả api và worker (job quét tự nộp chạy ở worker). */
@Global()
@Module({
  providers: [{ provide: REALTIME_NOTIFIER, useClass: RedisRealtimeNotifier }],
  exports: [REALTIME_NOTIFIER],
})
export class RealtimeNotifierModule {}
