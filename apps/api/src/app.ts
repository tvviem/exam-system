import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { registerOriginCheck } from './common/origin-check';
import { ZodExceptionFilter } from './common/zod-exception.filter';
import { ENV } from './config/config.module';
import type { Env } from './config/env';
import { MAX_UPLOAD_BYTES } from './modules/identity/account-requests/account-request-file';

export async function createApp(): Promise<NestFastifyApplication> {
  // trustProxy: chỉ tin X-Forwarded-For do nginx cùng pod gửi tới.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: 'loopback' }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  await configureApp(app);
  return app;
}

/** Cấu hình dùng chung cho app thật và app trong integration test. */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  await app.register(fastifyCookie);
  // Giới hạn thật của từng route được đặt khi đọc file; đây là trần chung.
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
  });
  registerOriginCheck(app.getHttpAdapter().getInstance(), app.get<Env>(ENV).APP_ORIGINS);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ZodExceptionFilter());
  app.enableShutdownHooks();
}
