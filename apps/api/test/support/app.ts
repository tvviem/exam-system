import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { configureApp } from '../../src/app';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/common/clock';
import { FakeClock } from './fake-clock';

export const ORIGIN = 'http://localhost:5173';

export interface TestApp {
  app: NestFastifyApplication;
  clock: FakeClock;
}

export async function createTestApp(): Promise<TestApp> {
  const clock = new FakeClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, clock };
}
