import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { configureApp } from '../../src/app';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/common/clock';
import { ENV } from '../../src/config/config.module';
import type { Env } from '../../src/config/env';
import { SLIP_RENDERER } from '../../src/modules/identity/credential-slips/slip-renderer';
import { MAIL_LIMITS, mailLimitsFromEnv } from '../../src/modules/mail/mail.config';
import {
  MAIL_PAUSE,
  MAIL_SECRETS,
  MAIL_TRANSPORT,
  MESSAGE_BUILDER,
} from '../../src/modules/mail/mail.ports';
import type { PlanLimits } from '../../src/modules/mail/plan-batch';
import { JOB_QUEUE, JobRegistry } from '../../src/queue/job-queue';
import { CapturingSlipRenderer } from './capturing-slip-renderer';
import { FakeClock } from './fake-clock';
import { FakeMailTransport, FakeMessageBuilder, TEST_SMTP_SECRET } from './fake-mail';
import { InlineJobQueue } from './inline-job-queue';

export const ORIGIN = 'http://localhost:5173';

export interface TestApp {
  app: NestFastifyApplication;
  clock: FakeClock;
  /** Chạy các job đã xếp: `await t.queue.drain()` thay cho worker. */
  queue: InlineJobQueue;
  /** Phiếu tài khoản đã dựng (thay cho bộ dựng PDF thật). */
  slips: CapturingSlipRenderer;
  /** Vận chuyển thư giả: ghi lại thư đã gửi. */
  mail: FakeMailTransport;
  /** Bộ dựng thư giả (thay cho `identity` ở PR 7c). */
  messages: FakeMessageBuilder;
  /** Cổng đang nghe, chỉ có khi tạo với `listen: true` (test Socket.IO cần kết nối thật). */
  port: number;
}

/** `realSlips`: dùng bộ dựng PDF thật thay cho bản ghi lại dữ liệu. */
export async function createTestApp(
  options: {
    realSlips?: boolean;
    listen?: boolean;
    /** Ghi đè hạn mức gửi thư (để thử trần bằng vài chục thư thay vì 400). */
    mailLimits?: Partial<PlanLimits>;
    /** `none`: như production chưa cấu hình SMTP (chế độ không gửi); mặc định là vận chuyển giả. */
    mailTransport?: 'fake' | 'none';
    /** true: dùng bộ dựng thư THẬT của `identity` (sinh Liên kết một lần) thay cho bản giả của test. */
    realMessageBuilder?: boolean;
  } = {},
): Promise<TestApp> {
  const clock = new FakeClock();
  const queue = new InlineJobQueue();
  const slips = new CapturingSlipRenderer();
  const mail = new FakeMailTransport(clock);
  const messages = new FakeMessageBuilder();
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(JOB_QUEUE)
    .useValue(queue)
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(options.mailTransport === 'none' ? null : mail)
    // Chờ giữa hai thư thì tua đồng hồ giả thay vì chờ thật.
    .overrideProvider(MAIL_LIMITS)
    .useFactory({
      inject: [ENV],
      factory: (env: Env) => ({ ...mailLimitsFromEnv(env), ...options.mailLimits }),
    })
    .overrideProvider(MAIL_SECRETS)
    .useValue([TEST_SMTP_SECRET])
    .overrideProvider(MAIL_PAUSE)
    .useValue(async (ms: number) => clock.advance(ms));
  if (!options.realSlips) builder.overrideProvider(SLIP_RENDERER).useValue(slips);
  if (!options.realMessageBuilder) builder.overrideProvider(MESSAGE_BUILDER).useValue(messages);
  const moduleRef = await builder.compile();
  queue.registry = moduleRef.get(JobRegistry);
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  let port = 0;
  if (options.listen) {
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as { port: number }).port;
  }
  return { app, clock, queue, slips, mail, messages, port };
}
