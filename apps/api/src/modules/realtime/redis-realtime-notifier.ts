import { REALTIME_REDIS_CHANNEL, type RealtimeMessage } from '@exam/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { RealtimeNotifier } from '../../common/realtime-notifier';
import { REDIS } from '../../redis/redis.module';

const log = new Logger('RealtimeNotifier');
/** Redis sập thì mỗi lần báo đều lỗi: chỉ ghi cảnh báo chừng này một lần để không tràn nhật ký. */
const WARN_EVERY_MS = 30_000;

/** Báo qua kênh Redis `realtime:events`; cổng Socket.IO (ở api) nghe kênh này và đẩy xuống đúng phòng. */
@Injectable()
export class RedisRealtimeNotifier implements RealtimeNotifier {
  private lastWarn = Number.NEGATIVE_INFINITY;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  sessionChanged(sessionId: string): void {
    this.publish([{ t: 'session', id: sessionId }]);
  }

  attemptNudge(attemptIds: readonly string[]): void {
    this.publish(attemptIds.map((id) => ({ t: 'attempt' as const, id })));
  }

  affected(sessionId: string, attemptIds: readonly string[]): void {
    this.publish([
      ...attemptIds.map((id) => ({ t: 'attempt' as const, id })),
      { t: 'session', id: sessionId },
    ]);
  }

  private publish(messages: RealtimeMessage[]) {
    if (messages.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const message of messages)
      pipeline.publish(REALTIME_REDIS_CHANNEL, JSON.stringify(message));
    pipeline.exec().catch((error) => this.warn(error));
  }

  private warn(error: unknown) {
    const now = performance.now();
    if (now - this.lastWarn < WARN_EVERY_MS) return;
    this.lastWarn = now;
    log.warn(
      `Không báo được kênh đẩy (các lần lỗi sau trong ${WARN_EVERY_MS / 1000} giây không ghi lại): ${String(error)}`,
    );
  }
}
