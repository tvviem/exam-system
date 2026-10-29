import { LoggerModule } from 'nestjs-pino';
import { stdSerializers } from 'pino-http';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

/** Token Lời mời nằm trong đường dẫn, nên phải che trước khi ghi log truy cập (Q78). */
export const redactInvitationToken = (url: string) =>
  url.replace(/^(\/api\/invitations\/)[^/?#]+/, '$1[redacted]');

export const PinoLoggerModule = LoggerModule.forRootAsync({
  inject: [ENV],
  useFactory: (env: Env) => ({
    pinoHttp: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      serializers: {
        req: (req: Parameters<typeof stdSerializers.req>[0]) => {
          const serialized = stdSerializers.req(req);
          return { ...serialized, url: redactInvitationToken(serialized.url) };
        },
      },
      redact: [
        'req.params.token',
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
      ],
    },
  }),
});
