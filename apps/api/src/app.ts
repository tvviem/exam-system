import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { registerOriginCheck } from './common/origin-check';
import { MAX_UPLOAD_BYTES } from './common/spreadsheet';
import { ZodExceptionFilter } from './common/zod-exception.filter';
import { ENV } from './config/config.module';
import { type Env, loadEnv, parseTrustProxy } from './config/env';
import { MAX_ILLUSTRATION_UPLOAD_BYTES } from './modules/question-bank/illustrations/image-processing';

export async function createApp(): Promise<NestFastifyApplication> {
  // trustProxy: chỉ tin X-Forwarded-For do nguồn được TRUST_PROXY cho phép (mặc định nginx cùng pod).
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: parseTrustProxy(loadEnv().TRUST_PROXY) }),
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
    limits: {
      fileSize: Math.max(MAX_UPLOAD_BYTES, MAX_ILLUSTRATION_UPLOAD_BYTES),
      files: 1,
      fields: 5,
    },
  });
  registerOriginCheck(app.getHttpAdapter().getInstance(), app.get<Env>(ENV).APP_ORIGINS);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ZodExceptionFilter());
  // Socket.IO dùng chung máy chủ HTTP của Fastify (đường dẫn `/ws`, không dưới tiền tố `/api`; khớp location /ws/ của nginx).
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableShutdownHooks();
}
