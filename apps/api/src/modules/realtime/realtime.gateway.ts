import {
  attemptRoom,
  type JoinAck,
  REALTIME_EVENT,
  REALTIME_JOIN,
  REALTIME_PATH,
  REALTIME_REDIS_CHANNEL,
  type RealtimeMessage,
  sessionRoom,
} from '@exam/shared';
import { Inject, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { DEVICE_COOKIE } from '../../common/device-cookie';
import { REALTIME_ACCESS, type RealtimeAccess } from '../../common/realtime-access';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { REDIS } from '../../redis/redis.module';
import { AUTH_SESSION_COOKIE } from '../identity/auth/auth.types';
import { TokenAuthenticator } from '../identity/auth/token-authenticator';
import { Coalescer } from './coalescer';
import { parseCookieHeader } from './cookies';

const monitorJoin = z.strictObject({ sessionId: z.uuid() });
const attemptJoin = z.strictObject({ attemptId: z.uuid() });
const message = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('session'), id: z.uuid() }),
  z.strictObject({ t: z.literal('attempt'), id: z.uuid() }),
]);

interface SocketData {
  userId: string;
  deviceKey: string | undefined;
}

/**
 * Kênh đẩy Socket.IO (PR 4d-3, Q213). Chỉ là phần tăng tốc: tin đẩy không mang dữ liệu, chỉ bảo trình duyệt hỏi lại REST,
 * nên mất kênh hay mất tin thì heartbeat và hỏi lại định kỳ vẫn giữ mọi thứ đúng.
 *
 * - Bắt tay: xác thực cookie `exam_sid` (cùng luật với REST) và kiểm `Origin`.
 * - Phòng `session:{id}` (Người ra đề, chủ Phiên thi): `monitor.changed`, gộp tối đa một tin mỗi `REALTIME_THROTTLE_MS`.
 * - Phòng `attempt:{id}` (Người dự thi, đúng Lượt và đúng thiết bị): `attempt.nudge` đến ngay.
 * - Nguồn tin là kênh Redis `realtime:events`, nên api và worker (job quét) đều báo được và nhiều bản api vẫn đúng.
 */
@WebSocketGateway({ path: REALTIME_PATH, serveClient: false, transports: ['websocket', 'polling'] })
export class RealtimeGateway implements OnGatewayInit, OnApplicationShutdown {
  private readonly log = new Logger(RealtimeGateway.name);
  @WebSocketServer() private server!: Server;
  private subscriber: Redis | undefined;
  private readonly coalescer: Coalescer;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REALTIME_ACCESS) private readonly access: RealtimeAccess,
    private readonly authenticator: TokenAuthenticator,
  ) {
    this.coalescer = new Coalescer(env.REALTIME_THROTTLE_MS, (sessionId) =>
      this.server.to(sessionRoom(sessionId)).emit(REALTIME_EVENT.monitorChanged),
    );
  }

  afterInit(server: Server) {
    const allowed = new Set(this.env.APP_ORIGINS);
    server.use(async (socket, next) => {
      const origin = socket.handshake.headers.origin;
      if (!origin || !allowed.has(origin)) return next(new Error('FORBIDDEN_ORIGIN'));
      const cookies = parseCookieHeader(socket.handshake.headers.cookie);
      try {
        const auth = await this.authenticator.authenticate(cookies[AUTH_SESSION_COOKIE]);
        if (!auth) return next(new Error('UNAUTHENTICATED'));
        const data: SocketData = { userId: auth.user.id, deviceKey: cookies[DEVICE_COOKIE] };
        socket.data = data;
        next();
      } catch (error) {
        this.log.warn(`Bắt tay lỗi: ${String(error)}`);
        next(new Error('UNAVAILABLE'));
      }
    });
    this.listen();
  }

  @SubscribeMessage(REALTIME_JOIN.monitor)
  async joinMonitor(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<JoinAck> {
    const parsed = monitorJoin.safeParse(body);
    if (!parsed.success) return { ok: false };
    const { sessionId } = parsed.data;
    const ok = await this.access
      .canMonitor((socket.data as SocketData).userId, sessionId)
      .catch(() => false);
    if (ok) await socket.join(sessionRoom(sessionId));
    return { ok };
  }

  @SubscribeMessage(REALTIME_JOIN.attempt)
  async joinAttempt(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown,
  ): Promise<JoinAck> {
    const parsed = attemptJoin.safeParse(body);
    if (!parsed.success) return { ok: false };
    const { attemptId } = parsed.data;
    const { userId, deviceKey } = socket.data as SocketData;
    const ok = await this.access.canFollow(userId, attemptId, deviceKey).catch(() => false);
    if (ok) await socket.join(attemptRoom(attemptId));
    return { ok };
  }

  async onApplicationShutdown() {
    this.coalescer.dispose();
    this.subscriber?.disconnect();
  }

  /** Nghe kênh Redis bằng một kết nối riêng (kết nối đã `subscribe` không dùng cho lệnh khác được). */
  private listen() {
    const subscriber = this.redis.duplicate();
    this.subscriber = subscriber;
    subscriber.on('error', (error) =>
      this.log.warn(`Kênh Redis của cổng đẩy lỗi: ${String(error)}`),
    );
    subscriber.on('message', (_channel, raw) => this.dispatch(raw));
    void subscriber.subscribe(REALTIME_REDIS_CHANNEL).catch((error) => {
      this.log.warn(`Không nghe được kênh đẩy: ${String(error)}`);
    });
  }

  private dispatch(raw: string) {
    let parsed: RealtimeMessage;
    try {
      const result = message.safeParse(JSON.parse(raw));
      if (!result.success) return;
      parsed = result.data;
    } catch {
      return; // tin hỏng bị bỏ qua, không làm sập cổng
    }
    if (parsed.t === 'session') this.coalescer.trigger(parsed.id);
    else this.server.to(attemptRoom(parsed.id)).emit(REALTIME_EVENT.attemptNudge);
  }
}
