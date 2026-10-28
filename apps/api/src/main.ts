import 'reflect-metadata';
import { createApp } from './app';
import { ENV } from './config/config.module';
import type { Env } from './config/env';
import { loadDotenvFile } from './config/env';

async function bootstrap() {
  loadDotenvFile();
  const app = await createApp();
  const env = app.get<Env>(ENV);
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

void bootstrap();
