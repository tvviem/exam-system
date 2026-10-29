import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { configureApp } from '../../src/app';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/common/clock';
import { JOB_QUEUE, JobRegistry } from '../../src/queue/job-queue';
import { FakeClock } from './fake-clock';
import { InlineJobQueue } from './inline-job-queue';

export const ORIGIN = 'http://localhost:5173';

export interface TestApp {
  app: NestFastifyApplication;
  clock: FakeClock;
  /** Chạy các job đã xếp: `await t.queue.drain()` thay cho worker. */
  queue: InlineJobQueue;
}

export async function createTestApp(): Promise<TestApp> {
  const clock = new FakeClock();
  const queue = new InlineJobQueue();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(JOB_QUEUE)
    .useValue(queue)
    .compile();
  queue.registry = moduleRef.get(JobRegistry);
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, clock, queue };
}
