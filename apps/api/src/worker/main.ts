import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadDotenvFile } from '../config/env';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  loadDotenvFile();
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  logger.log('Worker đã sẵn sàng');
}

void bootstrap();
