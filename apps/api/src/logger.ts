import { LoggerModule } from 'nestjs-pino';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

export const PinoLoggerModule = LoggerModule.forRootAsync({
  inject: [ENV],
  useFactory: (env: Env) => ({
    pinoHttp: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
  }),
});
