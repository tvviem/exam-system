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
}

export async function createTestApp(): Promise<TestApp> {
  const clock = new FakeClock();
  const queue = new InlineJobQueue();
  const slips = new CapturingSlipRenderer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(JOB_QUEUE)
    .useValue(queue)
    .overrideProvider(SLIP_RENDERER)
    .useValue(slips)
    .compile();
  queue.registry = moduleRef.get(JobRegistry);
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, clock, queue, slips };
}
