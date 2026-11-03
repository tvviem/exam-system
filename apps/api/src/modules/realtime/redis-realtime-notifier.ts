import { REALTIME_REDIS_CHANNEL, type RealtimeMessage } from '@exam/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { RealtimeNotifier } from '../../common/realtime-notifier';
import { REDIS } from '../../redis/redis.module';

const log = new Logger('RealtimeNotifier');

/** Báo qua kênh Redis `realtime:events`; cổng Socket.IO (ở api) nghe kênh này và đẩy xuống đúng phòng. */
@Injectable()
export class RedisRealtimeNotifier implements RealtimeNotifier {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  sessionChanged(sessionId: string): void {
    this.publish([{ t: 'session', id: sessionId }]);
  }

  attemptNudge(attemptIds: readonly string[]): void {
    this.publish(attemptIds.map((id) => ({ t: 'attempt' as const, id })));
  }

  private publish(messages: RealtimeMessage[]) {
    if (messages.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const message of messages)
      pipeline.publish(REALTIME_REDIS_CHANNEL, JSON.stringify(message));
    pipeline.exec().catch((error) => log.warn(`Không báo được kênh đẩy: ${String(error)}`));
  }
}
