import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { configureApp } from '../../src/app';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/common/clock';
import { SLIP_RENDERER } from '../../src/modules/identity/credential-slips/slip-renderer';
import { JOB_QUEUE, JobRegistry } from '../../src/queue/job-queue';
import { CapturingSlipRenderer } from './capturing-slip-renderer';
import { FakeClock } from './fake-clock';
import { InlineJobQueue } from './inline-job-queue';

export const ORIGIN = 'http://localhost:5173';

export interface TestApp {
  app: NestFastifyApplication;
  clock: FakeClock;
  /** Chạy các job đã xếp: `await t.queue.drain()` thay cho worker. */
  queue: InlineJobQueue;
  /** Phiếu tài khoản đã dựng (thay cho bộ dựng PDF thật). */
  slips: CapturingSlipRenderer;
  /** Cổng đang nghe, chỉ có khi tạo với `listen: true` (test Socket.IO cần kết nối thật). */
  port: number;
}

/** `realSlips`: dùng bộ dựng PDF thật thay cho bản ghi lại dữ liệu. */
export async function createTestApp(
  options: { realSlips?: boolean; listen?: boolean } = {},
): Promise<TestApp> {
  const clock = new FakeClock();
  const queue = new InlineJobQueue();
  const slips = new CapturingSlipRenderer();
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(JOB_QUEUE)
    .useValue(queue);
  if (!options.realSlips) builder.overrideProvider(SLIP_RENDERER).useValue(slips);
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
  return { app, clock, queue, slips, port };
}
